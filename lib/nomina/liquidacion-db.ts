/**
 * Liquidación de un empleado (capa con BD; la aritmética vive en `./liquidacion`).
 *
 * `armarLiquidacion` calcula todo sin escribir nada (la vista previa). `registrarLiquidacion`
 * hace lo mismo y, en UNA transacción, crea la corrida de un solo empleado (tipo
 * 'liquidacion', en borrador), sus componentes, la fila de liquidación y da de baja al
 * empleado. Si se borra el borrador, el empleado vuelve a como estaba.
 *
 * Impuestos:
 *   · Preaviso y cesantía: indemnizaciones, ni TSS ni ISR.
 *   · Vacaciones: salario. AFP, SFS, SRL e INFOTEP como un mes con ese ingreso, e ISR
 *     con la renta del año (no como si se repitiera 12 veces).
 *   · Regalía proporcional: sin TSS; exenta hasta 5 salarios mínimos (ver `./regalia`).
 *
 * Si el empleado tiene préstamos con saldo, se descuenta lo que alcance de la liquidación.
 */

import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import {
  empleadoPrestamos, empleados, nominaCorridas, nominaLineaConceptos, nominaLineas, nominaLiquidaciones,
} from '@/lib/db/schema';
import { calcularNominaEmpleado } from '@/lib/nomina/calculo';
import { tasasDelAnio } from '@/lib/config/nomina-tasas';
import { ajustesNomina } from '@/lib/nomina/ajustes-db';
import { calcularRegalia, isrDeRegalia } from '@/lib/nomina/regalia';
import { devengadoPorEmpleadoYMes } from '@/lib/nomina/regalia-db';
import {
  calcularLiquidacion, esMotivoSalida, LABEL_MOTIVO, type ClaveComponente, type ComponenteLiquidacion,
  type MotivoSalida, type ResultadoLiquidacion,
} from '@/lib/nomina/liquidacion';
import { getConfig } from '@/lib/contabilidad/config';
import { CODIGO_PRESTAMO, fechaRazonable } from '@/lib/nomina/conceptos';
import { catalogoConceptos } from '@/lib/nomina/conceptos-db';
import { sumarDiasYMD } from '@/lib/nomina/periodos';

export interface EntradaArmado {
  fechaSalida: unknown;
  motivo: unknown;
  /** Días de vacaciones pendientes; vacío = lo proporcional del período en curso. */
  diasVacacionesPendientes?: unknown;
  hoy: string;
}

export interface DescuentoPrestamo { prestamoId: number; saldoCents: number; descontarCents: number; comentario: string | null }

export interface LineaLiquidacion {
  brutoCents: number;
  afpEmpleadoCents: number; sfsEmpleadoCents: number; isrCents: number; otrasDeduccionesCents: number;
  totalDeduccionesCents: number; netoCents: number;
  afpPatronalCents: number; sfsPatronalCents: number; srlPatronalCents: number; infotepPatronalCents: number; totalPatronalCents: number;
  /** Lo gravado de vacaciones y regalía sobre lo que se calculó el ISR. */
  baseIsrCents: number;
}

export interface LiquidacionArmada {
  empleado: { id: number; nombre: string; cedula: string | null; fechaIngreso: string; salarioMensualCents: number };
  fechaSalida: string;
  motivo: MotivoSalida;
  resultado: ResultadoLiquidacion;
  linea: LineaLiquidacion;
  prestamos: DescuentoPrestamo[];
  avisos: string[];
}

export type ResultadoArmado = { ok: true; liquidacion: LiquidacionArmada } | { ok: false; error: string; status: number };

const fallo = (error: string, status = 400): ResultadoArmado => ({ ok: false, error, status });

/** Hasta cuántos días atrás se acepta una fecha de salida: más que eso casi seguro es el año mal tecleado. */
const DIAS_ATRAS_MAX = 400;
const DIAS_ADELANTE_MAX = 31;

export async function armarLiquidacion(teamId: number, empleadoId: number, e: EntradaArmado): Promise<ResultadoArmado> {
  const [emp] = await db.select().from(empleados).where(and(eq(empleados.id, empleadoId), eq(empleados.teamId, teamId))).limit(1);
  if (!emp) return fallo('Empleado no encontrado', 404);
  if (emp.estado !== 'activo') return fallo('Este empleado ya está de baja.', 409);
  const [yaLiquidado] = await db.select({ id: nominaLiquidaciones.id }).from(nominaLiquidaciones).where(eq(nominaLiquidaciones.empleadoId, emp.id)).limit(1);
  if (yaLiquidado) return fallo('Este empleado ya tiene una liquidación.', 409);
  if (!emp.fechaIngreso) return fallo('Falta la fecha de ingreso en la ficha del empleado: sin ella no se pueden contar los meses de servicio.');

  if (!esMotivoSalida(e.motivo)) return fallo('Elige el motivo de la salida.');
  if (!fechaRazonable(e.fechaSalida)) return fallo('La fecha de salida no es válida.');
  const fechaSalida = e.fechaSalida;
  if (fechaSalida < emp.fechaIngreso) return fallo('La fecha de salida es anterior a la de ingreso.');
  if (fechaSalida > sumarDiasYMD(e.hoy, DIAS_ADELANTE_MAX)) return fallo(`La fecha de salida no puede estar a más de ${DIAS_ADELANTE_MAX} días en el futuro.`);
  if (fechaSalida < sumarDiasYMD(e.hoy, -DIAS_ATRAS_MAX)) return fallo('La fecha de salida es de hace más de un año: revisa que el año esté bien escrito.');

  let diasVac: number | null = null;
  if (e.diasVacacionesPendientes !== undefined && e.diasVacacionesPendientes !== null && e.diasVacacionesPendientes !== '') {
    const v = e.diasVacacionesPendientes;
    // Solo número o texto de número: un arreglo o un objeto no se convierten en un número a la fuerza.
    const n = typeof v === 'number' ? v : typeof v === 'string' && /^\d+([.,]\d{1,2})?$/.test(v.trim()) ? Number(v.trim().replace(',', '.')) : NaN;
    if (!Number.isFinite(n) || n < 0 || n > 90) return fallo('Los días de vacaciones pendientes deben estar entre 0 y 90.');
    diasVac = n;
  }

  const anio = Number(fechaSalida.slice(0, 4));
  const ajustes = await ajustesNomina(teamId, fechaSalida);
  const tasas = tasasDelAnio(anio);
  const topeExento = ajustes.pisoCotizableCents ? 5 * ajustes.pisoCotizableCents : null;
  const devengado = (await devengadoPorEmpleadoYMes(teamId, [emp.id], anio)).get(emp.id) ?? {};
  const regalia = calcularRegalia({
    anio, salarioMensualCents: emp.salarioBaseCents, fechaIngreso: emp.fechaIngreso, fechaSalida,
    devengadoPorMes: devengado, topeExentoCents: topeExento,
  });

  const resultado = calcularLiquidacion({
    fechaIngreso: emp.fechaIngreso, fechaSalida, motivo: e.motivo, salarioMensualCents: emp.salarioBaseCents,
    diasVacacionesPendientes: diasVac, regalia,
  });
  const avisos = [...resultado.avisos];
  if (topeExento === null && regalia.regaliaCents > 0) avisos.push('La empresa no tiene configurado su tamaño: no se conoce el tope de 5 salarios mínimos y toda la regalía se trató como exenta de ISR.');

  // ── Impuestos: solo las vacaciones cotizan; ISR con la renta del año ──
  const vacaciones = resultado.componentes.find((c) => c.clave === 'vacaciones')?.montoCents ?? 0;
  const tss = calcularNominaEmpleado({ salarioMensualCents: vacaciones, tasas, pisoCotizableCents: 0, srlTasa: ajustes.srlTasa ?? undefined });
  const baseMensual = calcularNominaEmpleado({
    salarioMensualCents: emp.salarioBaseCents, tasas, pisoCotizableCents: emp.dispensaSalarioMinimo ? 0 : (ajustes.pisoCotizableCents ?? 0),
    srlTasa: ajustes.srlTasa ?? undefined,
  });
  const gravado = Math.max(0, vacaciones - tss.afpEmpleadoCents - tss.sfsEmpleadoCents) + regalia.gravadoCents;
  const isr = Math.min(isrDeRegalia(gravado, baseMensual.baseIsrMensualCents, tasas.isrEscala), resultado.totalCents);

  const bruto = resultado.totalCents;
  const afp = vacaciones > 0 ? tss.afpEmpleadoCents : 0;
  const sfs = vacaciones > 0 ? tss.sfsEmpleadoCents : 0;
  const netoAntesDeDescuentos = Math.max(0, bruto - afp - sfs - isr);

  // ── Préstamos con saldo: se descuentan de la liquidación hasta donde alcance ──
  const prestamosActivos = await db.select().from(empleadoPrestamos)
    .where(and(eq(empleadoPrestamos.empleadoId, emp.id), eq(empleadoPrestamos.teamId, teamId), eq(empleadoPrestamos.estado, 'activo')));
  let disponible = netoAntesDeDescuentos;
  const prestamos: DescuentoPrestamo[] = [];
  for (const p of prestamosActivos) {
    if (p.saldoCents <= 0) continue;
    const d = Math.min(p.saldoCents, disponible);
    disponible -= d;
    prestamos.push({ prestamoId: p.id, saldoCents: p.saldoCents, descontarCents: d, comentario: p.comentario });
    if (d < p.saldoCents) avisos.push(`El préstamo${p.comentario ? ` «${p.comentario}»` : ''} tiene un saldo de RD$${(p.saldoCents / 100).toLocaleString('es-DO', { minimumFractionDigits: 2 })} y la liquidación solo alcanza para descontar RD$${(d / 100).toLocaleString('es-DO', { minimumFractionDigits: 2 })}: el resto queda por cobrar.`);
  }
  const otras = prestamos.reduce((s, p) => s + p.descontarCents, 0);
  const totalDed = afp + sfs + isr + otras;

  return {
    ok: true,
    liquidacion: {
      empleado: { id: emp.id, nombre: [emp.nombres, emp.apellidos].filter(Boolean).join(' ').trim(), cedula: emp.cedula, fechaIngreso: emp.fechaIngreso, salarioMensualCents: emp.salarioBaseCents },
      fechaSalida, motivo: e.motivo, resultado, prestamos, avisos,
      linea: {
        brutoCents: bruto, afpEmpleadoCents: afp, sfsEmpleadoCents: sfs, isrCents: isr, otrasDeduccionesCents: otras,
        totalDeduccionesCents: totalDed, netoCents: bruto - totalDed,
        afpPatronalCents: vacaciones > 0 ? tss.afpPatronalCents : 0, sfsPatronalCents: vacaciones > 0 ? tss.sfsPatronalCents : 0,
        srlPatronalCents: vacaciones > 0 ? tss.srlPatronalCents : 0, infotepPatronalCents: vacaciones > 0 ? tss.infotepPatronalCents : 0,
        totalPatronalCents: vacaciones > 0 ? tss.totalPatronalCents : 0, baseIsrCents: gravado,
      },
    },
  };
}

/**
 * Cuentas de cada componente: el gasto al que va y, si la empresa provisiona, la
 * reserva (pasivo) contra la que se paga primero. Lo que no esté configurado queda
 * en null y cae en la cuenta de sueldos al asentar.
 */
async function cuentasDeComponentes(teamId: number): Promise<Record<ClaveComponente, { gasto: number | null; reserva: number | null }>> {
  const cfg = await getConfig(teamId);
  const sueldo = cfg.cuentaNominaSueldoId ?? cfg.cuentaGastosId ?? null;
  // La reserva se guarda siempre: si se usa o no lo decide el asiento al aprobar (solo si la empresa provisiona
  // y hay saldo acumulado), que es cuando se sabe cuánto hay.
  const reserva = (id: number | null) => id ?? cfg.cuentaProvisionPorPagarId;
  return {
    preaviso: { gasto: cfg.cuentaProvCesantiaGastoId ?? cfg.cuentaProvisionGastoId ?? sueldo, reserva: null },
    cesantia: { gasto: cfg.cuentaProvCesantiaGastoId ?? cfg.cuentaProvisionGastoId ?? sueldo, reserva: reserva(cfg.cuentaProvCesantiaPagarId) },
    vacaciones: { gasto: cfg.cuentaProvVacacionesGastoId ?? cfg.cuentaProvisionGastoId ?? sueldo, reserva: reserva(cfg.cuentaProvVacacionesPagarId) },
    regalia: { gasto: cfg.cuentaProvRegaliaGastoId ?? cfg.cuentaProvisionGastoId ?? sueldo, reserva: reserva(cfg.cuentaProvRegaliaPagarId) },
  };
}

export type ResultadoRegistro =
  | { ok: true; corridaId: number; liquidacion: LiquidacionArmada }
  | { ok: false; error: string; status: number };

export async function registrarLiquidacion(teamId: number, userId: number, empleadoId: number, e: EntradaArmado): Promise<ResultadoRegistro> {
  const armado = await armarLiquidacion(teamId, empleadoId, e);
  if (!armado.ok) return armado;
  const liq = armado.liquidacion;
  if (liq.resultado.totalCents <= 0) return { ok: false, status: 400, error: 'No hay nada que liquidar: con esos datos el total es cero.' };
  const cuentas = await cuentasDeComponentes(teamId);
  // El préstamo se salda contra la misma cuenta que usa la nómina regular («por cobrar a empleados»).
  const conceptoPrestamo = (await catalogoConceptos(teamId)).find((c) => c.codigo === CODIGO_PRESTAMO);
  const anio = Number(liq.fechaSalida.slice(0, 4));

  try {
    const corridaId = await db.transaction(async (tx) => {
      const [emp] = await tx.select().from(empleados).where(and(eq(empleados.id, empleadoId), eq(empleados.teamId, teamId))).limit(1).for('update');
      if (!emp || emp.estado !== 'activo') throw new ErrorLiquidacion('Este empleado ya está de baja.', 409);

      const [c] = await tx.insert(nominaCorridas).values({
        teamId, periodo: liq.fechaSalida.slice(0, 7), fechaInicio: liq.fechaSalida, fechaFin: liq.fechaSalida,
        descripcion: `Liquidación · ${liq.empleado.nombre}`.slice(0, 160), tipo: 'liquidacion', fechaPago: e.hoy > liq.fechaSalida ? e.hoy : liq.fechaSalida,
        estado: 'borrador', anioTasas: anio,
        totalBrutoCents: liq.linea.brutoCents, totalDeduccionesCents: liq.linea.totalDeduccionesCents,
        totalNetoCents: liq.linea.netoCents, totalPatronalCents: liq.linea.totalPatronalCents, createdBy: userId,
      }).returning();

      const l = liq.linea;
      const [linea] = await tx.insert(nominaLineas).values({
        corridaId: c.id, teamId, empleadoId, nombre: liq.empleado.nombre, cedula: liq.empleado.cedula, cargo: emp.cargo,
        brutoCents: l.brutoCents, afpEmpleadoCents: l.afpEmpleadoCents, sfsEmpleadoCents: l.sfsEmpleadoCents, isrCents: l.isrCents,
        otrasDeduccionesCents: l.otrasDeduccionesCents, totalDeduccionesCents: l.totalDeduccionesCents,
        afpPatronalCents: l.afpPatronalCents, sfsPatronalCents: l.sfsPatronalCents, srlPatronalCents: l.srlPatronalCents,
        infotepPatronalCents: l.infotepPatronalCents, totalPatronalCents: l.totalPatronalCents, netoCents: l.netoCents,
        salarioCotizableCents: l.afpEmpleadoCents > 0 ? liq.resultado.componentes.find((x) => x.clave === 'vacaciones')?.montoCents ?? 0 : 0,
        dependientesAdicionales: 0, dependientesAdicionalesCents: 0, diasPagados: null, diasPeriodo: null,
        provisionRegaliaCents: 0, provisionVacacionesCents: 0, provisionCesantiaCents: 0,
      }).returning({ id: nominaLineas.id });

      const filas = [
        ...liq.resultado.componentes.map((x: ComponenteLiquidacion) => ({
          lineaId: linea.id, corridaId: c.id, teamId, empleadoId, conceptoId: null, prestamoId: null,
          tipo: 'ingreso', nombre: x.nombre.slice(0, 120), montoCents: x.montoCents, pedidoCents: x.montoCents, cotizaTss: x.cotiza,
          cuentaId: cuentas[x.clave].gasto, reservaCuentaId: cuentas[x.clave].reserva, comentario: x.detalle.slice(0, 300),
        })),
        ...liq.prestamos.filter((p) => p.descontarCents > 0).map((p) => ({
          lineaId: linea.id, corridaId: c.id, teamId, empleadoId, conceptoId: conceptoPrestamo?.id ?? null, prestamoId: p.prestamoId,
          tipo: 'descuento', nombre: (p.comentario ? `Préstamo · ${p.comentario}` : 'Préstamo (saldo)').slice(0, 120),
          montoCents: p.descontarCents, pedidoCents: p.saldoCents, cotizaTss: false, cuentaId: conceptoPrestamo?.cuentaId ?? null, reservaCuentaId: null,
          comentario: 'Se descuenta de la liquidación',
        })),
      ];
      await tx.insert(nominaLineaConceptos).values(filas);

      await tx.insert(nominaLiquidaciones).values({
        teamId, empleadoId, corridaId: c.id, fechaIngreso: liq.empleado.fechaIngreso, fechaSalida: liq.fechaSalida, motivo: liq.motivo,
        mesesServicio: liq.resultado.mesesServicio, salarioMensualCents: liq.empleado.salarioMensualCents,
        salarioDiarioCents: liq.resultado.salarioDiarioCents, totalCents: liq.resultado.totalCents,
        componentes: liq.resultado.componentes, estadoPrevio: emp.estado, fechaSalidaPrevia: emp.fechaSalida, createdBy: userId,
      });

      // Sale de la nómina regular desde esa fecha: la corrida cuenta hasta su último día.
      await tx.update(empleados).set({ estado: 'inactivo', fechaSalida: liq.fechaSalida, updatedAt: new Date() })
        .where(and(eq(empleados.id, empleadoId), eq(empleados.teamId, teamId)));
      return c.id;
    });
    return { ok: true, corridaId, liquidacion: liq };
  } catch (err) {
    if (err instanceof ErrorLiquidacion) return { ok: false, error: err.message, status: err.status };
    if (err instanceof Error && /unique|duplicate/i.test(err.message)) return { ok: false, error: 'Este empleado ya tiene una liquidación.', status: 409 };
    throw err;
  }
}

class ErrorLiquidacion extends Error {
  constructor(message: string, readonly status = 400) { super(message); }
}

/**
 * Al borrar el borrador de una liquidación, el empleado vuelve a como estaba antes
 * (activo y sin fecha de salida). Se llama desde el borrado de la corrida.
 */
export async function revertirLiquidacionDeCorrida(teamId: number, corridaId: number): Promise<boolean> {
  const [liq] = await db.select().from(nominaLiquidaciones)
    .where(and(eq(nominaLiquidaciones.corridaId, corridaId), eq(nominaLiquidaciones.teamId, teamId))).limit(1);
  if (!liq) return false;
  await db.update(empleados).set({ estado: liq.estadoPrevio, fechaSalida: liq.fechaSalidaPrevia, updatedAt: new Date() })
    .where(and(eq(empleados.id, liq.empleadoId), eq(empleados.teamId, teamId)));
  return true;
}

export { LABEL_MOTIVO };
