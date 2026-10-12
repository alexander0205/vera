/**
 * Aplica empleados leídos de un Excel. Tres decisiones, las mismas del catálogo
 * de cuentas:
 *
 * 1. **La llave es la cédula.** Una cédula que no existe crea al empleado; una
 *    que existe lo actualiza con lo que cambió. Una celda vacía NUNCA borra lo
 *    que ya está.
 *
 * 2. **Importar nunca da de baja ni reactiva.** Quien está en el sistema y no en
 *    el archivo se queda como está; quien está de baja se omite con un aviso:
 *    cambiarle el salario a alguien que ya salió no tiene sentido.
 *
 * 3. **Todo o nada, y la vista previa ES la corrida.** Corre en una transacción
 *    y, si es vista previa o hubo un solo error, se deshace al final: lo que la
 *    pantalla anuncia es exactamente lo que después pasa.
 *
 * Las reglas de cada fila se validan ANTES de escribir nada de esa fila, así que
 * no hace falta un punto de guardado por fila; un error inesperado de la base
 * deshace la transacción entera. Los nuevos se insertan juntos al final.
 */

import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { empleadoConceptos, empleados } from '@/lib/db/schema';
import type { FilaEmpleado, ErrorFilaEmpleado, AvisoFilaEmpleado } from './empleados-excel';
import { catalogoConceptos } from './conceptos-db';

export interface CambioEmpleado { campo: string; antes: string; despues: string }

export interface ResultadoImportacionEmpleados {
  /** true solo si se confirmó y no hubo ni un error: los cambios quedaron. */
  aplicado: boolean;
  creados: { fila: number; cedula: string; nombre: string; salarioCents: number | null; incentivoCents: number | null }[];
  actualizados: { fila: number; cedula: string; nombre: string; cambios: CambioEmpleado[] }[];
  omitidos: { fila: number; cedula: string; nombre: string; motivo: string }[];
  sinCambios: number;
  errores: ErrorFilaEmpleado[];
  avisos: AvisoFilaEmpleado[];
}

class DeshacerImportacion extends Error {
  constructor(readonly resultado: ResultadoImportacionEmpleados) { super('deshacer importación'); }
}
/** Un error de regla de una fila: se anota y se sigue con las demás. */
class ErrorDeFila extends Error {}

const digitos = (v: string | null) => (v ?? '').replace(/\D/g, '');
const RD = (cents: number | null | undefined) =>
  cents == null ? '—' : `RD$${(cents / 100).toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const ETIQUETA_FRECUENCIA: Record<string, string> = { mensual: 'Mensual', quincenal: 'Quincenal', semanal: 'Semanal' };
const ETIQUETA_TIPO_CUENTA: Record<string, string> = { ahorros: 'Ahorros', corriente: 'Corriente' };

/** Un cambio de más de esto en el salario pide mirar dos veces (columna corrida, cero de más). */
const SALTO_SALARIO = 0.3;
/** Filas por insert: lotes para no armar una sentencia con miles de parámetros. */
const LOTE = 200;

type Fila = typeof empleados.$inferSelect;
type Incentivo = typeof empleadoConceptos.$inferSelect;

export async function importarEmpleados(
  teamId: number,
  userId: number,
  filas: FilaEmpleado[],
  opts: { aplicar: boolean; erroresDeLectura?: ErrorFilaEmpleado[]; avisosDeLectura?: AvisoFilaEmpleado[] },
): Promise<ResultadoImportacionEmpleados> {
  const resultado: ResultadoImportacionEmpleados = {
    aplicado: false,
    creados: [], actualizados: [], omitidos: [], sinCambios: 0,
    errores: [...(opts.erroresDeLectura ?? [])],
    avisos: [...(opts.avisosDeLectura ?? [])],
  };

  try {
    await db.transaction(async (tx) => {
      const existentes = await tx.select().from(empleados).where(eq(empleados.teamId, teamId));
      // Por cédula. Si hay dos con la misma, gana el activo; dos activos es ambiguo.
      const porCedula = new Map<string, Fila[]>();
      for (const e of existentes) {
        const c = digitos(e.cedula);
        if (c) porCedula.set(c, [...(porCedula.get(c) ?? []), e]);
      }

      const catalogo = await catalogoConceptos(teamId, tx);
      const incentivo = catalogo.find((c) => c.codigo === 'incentivo');
      const hoy = new Date().toISOString().slice(0, 10);

      // Los incentivos fijos vigentes, de una vez: una consulta por fila tardaba segundos con mil empleados.
      const incentivosVigentes = new Map<number, Incentivo>();
      if (incentivo) {
        const vigentes = await tx.select().from(empleadoConceptos).where(and(
          eq(empleadoConceptos.teamId, teamId), eq(empleadoConceptos.conceptoId, incentivo.id),
          eq(empleadoConceptos.activo, true), eq(empleadoConceptos.fijo, true),
        ));
        for (const i of vigentes) incentivosVigentes.set(i.empleadoId, i);
      }

      const nuevos: { valores: typeof empleados.$inferInsert; incentivoCents: number | null; desde: string }[] = [];
      const sinIngreso: number[] = [];

      for (const f of filas) {
        try {
          const nombreFila = [f.nombres, f.apellidos].filter(Boolean).join(' ') || f.cedula;
          const aviso = (mensaje: string) => resultado.avisos.push({ fila: f.fila, cedula: f.cedula, mensaje });
          const candidatos = porCedula.get(f.cedula) ?? [];
          const activos = candidatos.filter((c) => c.estado === 'activo');
          if (activos.length > 1) {
            throw new ErrorDeFila(`Hay ${activos.length} empleados activos con la cédula ${f.cedula} en Zero. Resuelve el duplicado antes de importar.`);
          }
          const actual = activos[0] ?? null;

          if (!actual && candidatos.length > 0) {
            const baja = candidatos[0];
            resultado.omitidos.push({
              fila: f.fila, cedula: f.cedula, nombre: `${baja.nombres} ${baja.apellidos}`,
              motivo: 'Está de baja en Zero: no se modifica ni se reactiva desde Excel.',
            });
            continue;
          }

          // ── Alta ──
          if (!actual) {
            const faltan = [!f.nombres && 'Nombres', !f.apellidos && 'Apellidos', f.salarioCents === undefined && 'Salario mensual']
              .filter(Boolean);
            if (faltan.length > 0) throw new ErrorDeFila(`Un empleado nuevo necesita ${faltan.join(', ')}.`);
            if (f.cuenta && !f.tipoCuenta) throw new ErrorDeFila('La cuenta bancaria necesita su Tipo de cuenta (Ahorros o Corriente): el banco rechaza la línea sin él.');
            if (!f.ingreso) sinIngreso.push(f.fila);

            nuevos.push({
              valores: {
                teamId, cedula: f.cedula, nombres: f.nombres!, apellidos: f.apellidos!, cargo: f.cargo ?? null,
                salarioBaseCents: f.salarioCents!, frecuenciaPago: f.frecuencia ?? 'mensual',
                fechaIngreso: f.ingreso ?? null, estado: 'activo', afp: f.afp ?? null, ars: f.ars ?? null,
                bancoNombre: f.banco ?? null, bancoCuenta: f.cuenta ?? null, bancoTipoCuenta: f.tipoCuenta ?? null,
                vacacionesDias: f.vacaciones ?? null, telefono: f.telefono ?? null, email: f.correo ?? null,
                createdBy: userId,
              },
              incentivoCents: f.incentivoCents && incentivo ? f.incentivoCents : null,
              desde: f.ingreso && f.ingreso > hoy ? f.ingreso : hoy,
            });
            resultado.creados.push({
              fila: f.fila, cedula: f.cedula, nombre: nombreFila,
              salarioCents: f.salarioCents ?? null, incentivoCents: f.incentivoCents ?? null,
            });
            continue;
          }

          // ── Actualización: solo lo que cambia ──
          const cambios: CambioEmpleado[] = [];
          const set: Partial<typeof empleados.$inferInsert> = {};
          const texto = (campo: string, clave: keyof typeof empleados.$inferInsert, antes: string | null, despues: string | undefined) => {
            if (despues !== undefined && despues !== (antes ?? '')) {
              cambios.push({ campo, antes: antes || '—', despues });
              (set as Record<string, unknown>)[clave] = despues;
            }
          };
          texto('Nombres', 'nombres', actual.nombres, f.nombres);
          texto('Apellidos', 'apellidos', actual.apellidos, f.apellidos);
          texto('Cargo', 'cargo', actual.cargo, f.cargo);
          texto('Banco', 'bancoNombre', actual.bancoNombre, f.banco);
          texto('Cuenta bancaria', 'bancoCuenta', actual.bancoCuenta, f.cuenta);
          texto('AFP', 'afp', actual.afp, f.afp);
          texto('ARS', 'ars', actual.ars, f.ars);
          texto('Teléfono', 'telefono', actual.telefono, f.telefono);
          texto('Correo', 'email', actual.email, f.correo);
          if (f.ingreso !== undefined && f.ingreso !== actual.fechaIngreso) {
            cambios.push({ campo: 'Fecha de ingreso', antes: actual.fechaIngreso ?? '—', despues: f.ingreso });
            set.fechaIngreso = f.ingreso;
          }
          if (f.tipoCuenta !== undefined && f.tipoCuenta !== actual.bancoTipoCuenta) {
            cambios.push({ campo: 'Tipo de cuenta', antes: ETIQUETA_TIPO_CUENTA[actual.bancoTipoCuenta ?? ''] ?? '—', despues: ETIQUETA_TIPO_CUENTA[f.tipoCuenta] });
            set.bancoTipoCuenta = f.tipoCuenta;
          }
          if (f.vacaciones !== undefined && f.vacaciones !== actual.vacacionesDias) {
            cambios.push({ campo: 'Días de vacaciones', antes: String(actual.vacacionesDias ?? '—'), despues: String(f.vacaciones) });
            set.vacacionesDias = f.vacaciones;
          }
          if (f.frecuencia !== undefined && f.frecuencia !== actual.frecuenciaPago) {
            cambios.push({ campo: 'Frecuencia de pago', antes: ETIQUETA_FRECUENCIA[actual.frecuenciaPago] ?? actual.frecuenciaPago, despues: ETIQUETA_FRECUENCIA[f.frecuencia] });
            set.frecuenciaPago = f.frecuencia;
            aviso('Cambia la frecuencia de pago: revisa que no quede con una corrida ya generada en la frecuencia anterior.');
          }
          if (f.salarioCents !== undefined && f.salarioCents !== actual.salarioBaseCents) {
            cambios.push({ campo: 'Salario mensual', antes: RD(actual.salarioBaseCents), despues: RD(f.salarioCents) });
            set.salarioBaseCents = f.salarioCents;
            if (actual.salarioBaseCents > 0) {
              const salto = Math.abs(f.salarioCents - actual.salarioBaseCents) / actual.salarioBaseCents;
              if (salto > SALTO_SALARIO) {
                aviso(`El salario cambia ${Math.round(salto * 100)} % (${RD(actual.salarioBaseCents)} → ${RD(f.salarioCents)}). Confirma que no es una columna corrida o un cero de más.`);
              }
            }
          }

          // La cuenta del banco tiene que quedar completa con lo que ya había más lo que llega.
          const cuentaFinal = (set.bancoCuenta as string | undefined) ?? actual.bancoCuenta;
          const tipoFinal = (set.bancoTipoCuenta as string | undefined) ?? actual.bancoTipoCuenta;
          if (cuentaFinal && !tipoFinal) {
            throw new ErrorDeFila('La cuenta bancaria necesita su Tipo de cuenta (Ahorros o Corriente): el banco rechaza la línea sin él.');
          }

          // Incentivo fijo: crear, cambiar el monto o quitarlo (con 0). Vacío no toca nada.
          if (f.incentivoCents !== undefined && incentivo) {
            const vigente = incentivosVigentes.get(actual.id);
            if (f.incentivoCents === 0) {
              if (vigente) {
                await tx.update(empleadoConceptos).set({ activo: false }).where(eq(empleadoConceptos.id, vigente.id));
                cambios.push({ campo: 'Incentivo fijo', antes: RD(vigente.montoCents), despues: 'Sin incentivo' });
              }
            } else if (!vigente) {
              await tx.insert(empleadoConceptos).values({
                teamId, empleadoId: actual.id, conceptoId: incentivo.id, montoCents: f.incentivoCents,
                fijo: true, desde: hoy, comentario: 'Importado de Excel', createdBy: userId,
              });
              cambios.push({ campo: 'Incentivo fijo', antes: '—', despues: RD(f.incentivoCents) });
            } else if (vigente.montoCents !== f.incentivoCents) {
              await tx.update(empleadoConceptos).set({ montoCents: f.incentivoCents }).where(eq(empleadoConceptos.id, vigente.id));
              cambios.push({ campo: 'Incentivo fijo', antes: RD(vigente.montoCents), despues: RD(f.incentivoCents) });
            }
          }

          if (Object.keys(set).length > 0) {
            await tx.update(empleados).set({ ...set, updatedAt: new Date() }).where(and(eq(empleados.id, actual.id), eq(empleados.teamId, teamId)));
          }
          if (cambios.length === 0) { resultado.sinCambios++; continue; }
          resultado.actualizados.push({ fila: f.fila, cedula: f.cedula, nombre: `${actual.nombres} ${actual.apellidos}`, cambios });
        } catch (e) {
          if (e instanceof ErrorDeFila) {
            resultado.errores.push({ fila: f.fila, cedula: f.cedula, mensaje: e.message });
            continue;
          }
          throw e;
        }
      }

      // Un aviso por todos los nuevos sin fecha, no uno por cada uno: con mil filas eran mil líneas iguales.
      if (sinIngreso.length > 0) {
        const lista = sinIngreso.slice(0, 8).join(', ') + (sinIngreso.length > 8 ? `… y ${sinIngreso.length - 8} más` : '');
        resultado.avisos.push({
          fila: sinIngreso[0], cedula: '',
          mensaje: `${sinIngreso.length} empleado${sinIngreso.length === 1 ? '' : 's'} nuevo${sinIngreso.length === 1 ? '' : 's'} sin fecha de ingreso (filas ${lista}): la nómina les pagará el mes completo desde el primer mes.`,
        });
      }

      // Hay errores o es solo vista previa: no se escribe nada de los nuevos.
      if (!opts.aplicar || resultado.errores.length > 0) throw new DeshacerImportacion(resultado);

      for (let i = 0; i < nuevos.length; i += LOTE) {
        const lote = nuevos.slice(i, i + LOTE);
        const guardados = await tx.insert(empleados).values(lote.map((n) => n.valores)).returning({ id: empleados.id });
        const incentivos = lote
          .map((n, k) => (n.incentivoCents && incentivo
            ? { teamId, empleadoId: guardados[k].id, conceptoId: incentivo.id, montoCents: n.incentivoCents, fijo: true, desde: n.desde, comentario: 'Importado de Excel', createdBy: userId }
            : null))
          .filter((x): x is NonNullable<typeof x> => x !== null);
        if (incentivos.length > 0) await tx.insert(empleadoConceptos).values(incentivos);
      }
    });
  } catch (e) {
    if (e instanceof DeshacerImportacion) {
      e.resultado.errores.sort((a, b) => a.fila - b.fila);
      e.resultado.avisos.sort((a, b) => a.fila - b.fila);
      return { ...e.resultado, aplicado: false };
    }
    throw e;
  }
  resultado.errores.sort((a, b) => a.fila - b.fila);
  resultado.avisos.sort((a, b) => a.fila - b.fila);
  return { ...resultado, aplicado: true };
}
