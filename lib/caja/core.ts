/**
 * Cuadre de caja — lógica de negocio (Fase 1, modelo "una caja por cajero").
 *
 * Reglas clave (ver requerimiento):
 *  - El monto de apertura se bloquea al confirmar (no editable).
 *  - El esperado del cierre lo CALCULA el sistema desde el ledger pagos_recibidos
 *    (efectivo) + movimientos de caja. El cajero solo ingresa el conteo físico.
 *  - Los movimientos registrados son inmutables (no hay update/delete de cajero).
 *  - Un cierre con diferencia ≠ 0 exige justificación + aprobación de admin/owner.
 *  - Toda operación deja rastro en audit_logs (lib/audit.ts) + row_audit_log (triggers).
 *
 * Conciliación: como en este sistema NO existe cobro sin emisión (cada
 * pagos_recibidos referencia un ecf_document), el efectivo esperado se deriva
 * de comprobantes reales. La `diferencia` destapa cualquier efectivo sin
 * comprobante (la "venta cobrada y no registrada").
 */

import { and, eq, sql, desc } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import {
  cajaTurnos,
  cajaMovimientos,
  pagosRecibidos,
  ecfDocuments,
  type CajaTurno,
} from '@/lib/db/schema';
import { generarNumeroCierre } from './codigo';

export type EstadoTurno = 'ABIERTO' | 'CIERRE_SOLICITADO' | 'CERRADO';
export type TipoMovimiento = 'ENTRADA' | 'SALIDA' | 'GASTO' | 'RETIRO' | 'AJUSTE';

const TIPOS_MOVIMIENTO: TipoMovimiento[] = ['ENTRADA', 'SALIDA', 'GASTO', 'RETIRO', 'AJUSTE'];
const TIPOS_SUMAN  = new Set<TipoMovimiento>(['ENTRADA', 'AJUSTE']);
const TIPOS_RESTAN = new Set<TipoMovimiento>(['SALIDA', 'GASTO', 'RETIRO']);

/** Métodos de pago que cuentan como efectivo físico en la caja. */
function esEfectivo(metodo: string | null | undefined): boolean {
  const m = (metodo ?? '').trim().toLowerCase();
  return m === 'efectivo' || m === 'cash';
}

// ─── Consultas ────────────────────────────────────────────────────────────────

/** Turno vivo (ABIERTO o CIERRE_SOLICITADO) del cajero, o null. */
export async function getTurnoAbierto(
  teamId: number,
  usuarioId: number,
): Promise<CajaTurno | null> {
  const [t] = await db
    .select()
    .from(cajaTurnos)
    .where(and(
      eq(cajaTurnos.teamId, teamId),
      eq(cajaTurnos.usuarioId, usuarioId),
      sql`${cajaTurnos.estado} IN ('ABIERTO', 'CIERRE_SOLICITADO')`,
    ))
    .limit(1);
  return t ?? null;
}

export async function getTurno(teamId: number, turnoId: number): Promise<CajaTurno | null> {
  const [t] = await db
    .select()
    .from(cajaTurnos)
    .where(and(eq(cajaTurnos.id, turnoId), eq(cajaTurnos.teamId, teamId)))
    .limit(1);
  return t ?? null;
}

export interface DesgloseEsperado {
  montoApertura:  number;
  ventasEfectivo: number;  // pagos efectivo atados al turno
  entradas:       number;  // ENTRADA + AJUSTE (efectivo)
  salidas:        number;  // SALIDA + GASTO + RETIRO (efectivo)
  esperado:       number;  // apertura + ventas + entradas − salidas
}

/**
 * Calcula el efectivo esperado en caja al cierre. Acepta un executor opcional
 * para correr dentro de una transacción (lock del turno).
 */
export async function calcularEsperado(
  teamId: number,
  turno: CajaTurno,
  executor: typeof db = db,
): Promise<DesgloseEsperado> {
  // Ventas en efectivo: pagos del turno con método efectivo.
  const [pagoAgg] = await executor
    .select({
      total: sql<number>`coalesce(sum(${pagosRecibidos.montoCentavos}), 0)`,
    })
    .from(pagosRecibidos)
    .where(and(
      eq(pagosRecibidos.teamId, teamId),
      eq(pagosRecibidos.turnoCajaId, turno.id),
      sql`lower(${pagosRecibidos.metodo}) IN ('efectivo', 'cash')`,
    ));
  const ventasEfectivo = Number(pagoAgg?.total ?? 0);

  // Movimientos de caja en efectivo (separados por sentido).
  const movs = await executor
    .select({
      tipo:  cajaMovimientos.tipo,
      total: sql<number>`coalesce(sum(${cajaMovimientos.montoCentavos}), 0)`,
    })
    .from(cajaMovimientos)
    .where(and(
      eq(cajaMovimientos.teamId, teamId),
      eq(cajaMovimientos.turnoId, turno.id),
      sql`lower(${cajaMovimientos.metodo}) IN ('efectivo', 'cash')`,
    ))
    .groupBy(cajaMovimientos.tipo);

  let entradas = 0;
  let salidas = 0;
  for (const m of movs) {
    const tipo = m.tipo as TipoMovimiento;
    const monto = Number(m.total ?? 0);
    if (TIPOS_SUMAN.has(tipo)) entradas += monto;
    else if (TIPOS_RESTAN.has(tipo)) salidas += monto;
  }

  const montoApertura = turno.montoAperturaCentavos;
  const esperado = montoApertura + ventasEfectivo + entradas - salidas;

  return { montoApertura, ventasEfectivo, entradas, salidas, esperado };
}

export interface VentaPorMetodo {
  metodo: string;        // normalizado lower-case
  total:  number;        // centavos
}

/**
 * Total vendido (cobrado) en el turno desglosado por método de pago. Incluye
 * TODOS los métodos (efectivo, tarjeta, transferencia, …), no solo efectivo —
 * para visibilidad del cajero en el cierre. Solo el efectivo afecta el esperado
 * en caja; los demás se muestran informativos.
 */
export async function getVentasPorMetodo(
  teamId: number,
  turnoId: number,
  executor: typeof db = db,
): Promise<VentaPorMetodo[]> {
  const rows = await executor
    .select({
      metodo: sql<string>`lower(${pagosRecibidos.metodo})`,
      total:  sql<number>`coalesce(sum(${pagosRecibidos.montoCentavos}), 0)`,
    })
    .from(pagosRecibidos)
    .where(and(
      eq(pagosRecibidos.teamId, teamId),
      eq(pagosRecibidos.turnoCajaId, turnoId),
    ))
    .groupBy(sql`lower(${pagosRecibidos.metodo})`);

  return rows
    .map(r => ({ metodo: r.metodo ?? 'otro', total: Number(r.total ?? 0) }))
    .filter(r => r.total > 0)
    .sort((a, b) => b.total - a.total);
}

/**
 * Conciliación NCF ↔ efectivo del turno: lista los e-CF emitidos en el turno con
 * su estado, y marca cuáles fueron cobrados en efectivo.
 */
export async function getConciliacion(teamId: number, turnoId: number) {
  return db
    .select({
      id:                   ecfDocuments.id,
      encf:                 ecfDocuments.encf,
      tipoEcf:              ecfDocuments.tipoEcf,
      estado:               ecfDocuments.estado,
      razonSocialComprador: ecfDocuments.razonSocialComprador,
      montoTotal:           ecfDocuments.montoTotal,
      pagadoEfectivo: sql<number>`coalesce((
        SELECT SUM(monto_centavos) FROM pagos_recibidos
        WHERE pagos_recibidos.ecf_document_id = ecf_documents.id
          AND pagos_recibidos.turno_caja_id = ${turnoId}
          AND lower(pagos_recibidos.metodo) IN ('efectivo', 'cash')
      ), 0)`,
    })
    .from(ecfDocuments)
    .where(and(
      eq(ecfDocuments.teamId, teamId),
      eq(ecfDocuments.turnoCajaId, turnoId),
    ))
    .orderBy(desc(ecfDocuments.fechaEmision));
}

// ─── Mutaciones ─────────────────────────────────────────────────────────────

/** Abre un turno para el cajero. Falla si ya tiene uno vivo. */
export async function abrirTurno(input: {
  teamId: number;
  usuarioId: number;
  aperturaPor: number;
  montoAperturaCentavos: number;
  aperturaObs?: string | null;
}): Promise<CajaTurno> {
  if (input.montoAperturaCentavos < 0) {
    throw new Error('El monto de apertura no puede ser negativo');
  }

  const existente = await getTurnoAbierto(input.teamId, input.usuarioId);
  if (existente) {
    throw new Error('Ya tienes un turno de caja abierto. Ciérralo antes de abrir otro.');
  }

  try {
    const [turno] = await db
      .insert(cajaTurnos)
      .values({
        teamId:                input.teamId,
        usuarioId:             input.usuarioId,
        estado:                'ABIERTO',
        montoAperturaCentavos: input.montoAperturaCentavos,
        aperturaPor:           input.aperturaPor,
        aperturaObs:           input.aperturaObs ?? null,
      })
      .returning();
    return turno;
  } catch (e: unknown) {
    // El índice único parcial es la red de seguridad ante carreras.
    if (e instanceof Error && /caja_turnos_usuario_abierto_uniq/.test(e.message)) {
      throw new Error('Ya tienes un turno de caja abierto.');
    }
    throw e;
  }
}

/** Registra un movimiento de caja (inmutable tras crear). */
export async function registrarMovimiento(input: {
  teamId: number;
  turnoId: number;
  tipo: TipoMovimiento;
  montoCentavos: number;
  metodo?: string;
  descripcion?: string | null;
  motivo?: string | null;
  origen?: 'SISTEMA' | 'SUPERVISOR';
  createdBy?: number;
}) {
  if (!TIPOS_MOVIMIENTO.includes(input.tipo)) {
    throw new Error(`Tipo de movimiento inválido: ${input.tipo}`);
  }
  if (input.montoCentavos <= 0) {
    throw new Error('El monto del movimiento debe ser positivo');
  }
  if (input.tipo === 'AJUSTE' && !input.motivo?.trim()) {
    throw new Error('Un ajuste requiere un motivo (queda en bitácora)');
  }

  const turno = await getTurno(input.teamId, input.turnoId);
  if (!turno) throw new Error('Turno no encontrado');
  if (turno.estado === 'CERRADO') {
    throw new Error('No se pueden registrar movimientos en un turno cerrado');
  }

  const [mov] = await db
    .insert(cajaMovimientos)
    .values({
      teamId:        input.teamId,
      turnoId:       input.turnoId,
      tipo:          input.tipo,
      montoCentavos: input.montoCentavos,
      metodo:        input.metodo ?? 'efectivo',
      descripcion:   input.descripcion ?? null,
      motivo:        input.motivo ?? null,
      origen:        input.origen ?? 'SISTEMA',
      createdBy:     input.createdBy ?? null,
    })
    .returning();
  return mov;
}

export interface ResultadoCierre {
  turno: CajaTurno;
  desglose: DesgloseEsperado;
  diferenciaCentavos: number;
  requiereAprobacion: boolean;
}

/**
 * El cajero solicita el cierre con su conteo físico. El sistema calcula el
 * esperado y la diferencia:
 *   - diferencia == 0 → cierre directo (CERRADO).
 *   - diferencia != 0 → exige justificación (cierreObs) y queda CIERRE_SOLICITADO
 *     a la espera de aprobación de admin/owner.
 */
export async function solicitarCierre(input: {
  teamId: number;
  turnoId: number;
  usuarioId: number;           // cajero que cierra (debe ser dueño del turno)
  efectivoContadoCentavos: number;
  cierreObs?: string | null;
}): Promise<ResultadoCierre> {
  if (input.efectivoContadoCentavos < 0) {
    throw new Error('El conteo físico no puede ser negativo');
  }

  return db.transaction(async (tx) => {
    // Lock del turno para evitar doble cierre concurrente.
    const [turno] = await tx
      .select()
      .from(cajaTurnos)
      .where(and(eq(cajaTurnos.id, input.turnoId), eq(cajaTurnos.teamId, input.teamId)))
      .for('update')
      .limit(1);

    if (!turno) throw new Error('Turno no encontrado');
    if (turno.usuarioId !== input.usuarioId) {
      throw new Error('Solo el cajero dueño del turno puede solicitar su cierre');
    }
    if (turno.estado !== 'ABIERTO') {
      throw new Error('El turno no está abierto');
    }

    const desglose = await calcularEsperado(input.teamId, turno, tx as unknown as typeof db);
    const diferencia = input.efectivoContadoCentavos - desglose.esperado;
    // Todo cierre requiere aprobación del admin/owner, independientemente del descuadre.
    const requiereAprobacion = true;

    // La justificación sigue siendo obligatoria solo cuando hay diferencia.
    if (diferencia !== 0 && !input.cierreObs?.trim()) {
      throw new Error('Hay una diferencia: debes justificar el descuadre antes de cerrar');
    }

    const numeroCierre = turno.numeroCierre
      ?? await generarNumeroCierre(tx as unknown as typeof db, input.teamId);

    const [actualizado] = await tx
      .update(cajaTurnos)
      .set({
        estado:                  'CIERRE_SOLICITADO',
        numeroCierre,
        efectivoContadoCentavos: input.efectivoContadoCentavos,
        montoEsperadoCentavos:   desglose.esperado,
        diferenciaCentavos:      diferencia,
        cierreObs:               input.cierreObs ?? null,
        cierreSolicitadoAt:      new Date(),
        aprobadoAt:              null,
        updatedAt:               new Date(),
      })
      .where(eq(cajaTurnos.id, turno.id))
      .returning();

    return { turno: actualizado, desglose, diferenciaCentavos: diferencia, requiereAprobacion };
  });
}

/** Admin/owner aprueba un cierre con descuadre → CERRADO. */
export async function aprobarCierre(input: {
  teamId: number;
  turnoId: number;
  aprobadoPor: number;
  aprobacionObs?: string | null;
}): Promise<CajaTurno> {
  return db.transaction(async (tx) => {
    const [turno] = await tx
      .select()
      .from(cajaTurnos)
      .where(and(eq(cajaTurnos.id, input.turnoId), eq(cajaTurnos.teamId, input.teamId)))
      .for('update')
      .limit(1);

    if (!turno) throw new Error('Turno no encontrado');
    if (turno.estado !== 'CIERRE_SOLICITADO') {
      throw new Error('El turno no está pendiente de aprobación');
    }

    const [actualizado] = await tx
      .update(cajaTurnos)
      .set({
        estado:        'CERRADO',
        aprobadoPor:   input.aprobadoPor,
        aprobadoAt:    new Date(),
        aprobacionObs: input.aprobacionObs ?? null,
        updatedAt:     new Date(),
      })
      .where(eq(cajaTurnos.id, turno.id))
      .returning();
    return actualizado;
  });
}

/** Admin/owner rechaza el cierre → el turno vuelve a ABIERTO para reconteo. */
export async function rechazarCierre(input: {
  teamId: number;
  turnoId: number;
  aprobadoPor: number;
  aprobacionObs: string;
}): Promise<CajaTurno> {
  if (!input.aprobacionObs?.trim()) {
    throw new Error('El rechazo requiere un motivo');
  }
  return db.transaction(async (tx) => {
    const [turno] = await tx
      .select()
      .from(cajaTurnos)
      .where(and(eq(cajaTurnos.id, input.turnoId), eq(cajaTurnos.teamId, input.teamId)))
      .for('update')
      .limit(1);

    if (!turno) throw new Error('Turno no encontrado');
    if (turno.estado !== 'CIERRE_SOLICITADO') {
      throw new Error('El turno no está pendiente de aprobación');
    }

    const [actualizado] = await tx
      .update(cajaTurnos)
      .set({
        estado:                  'ABIERTO',
        aprobadoPor:             input.aprobadoPor,
        aprobadoAt:              new Date(),
        aprobacionObs:           input.aprobacionObs,
        // Reabrir para reconteo: se descartan los valores del intento rechazado.
        efectivoContadoCentavos: null,
        montoEsperadoCentavos:   null,
        diferenciaCentavos:      null,
        cierreSolicitadoAt:      null,
        updatedAt:               new Date(),
      })
      .where(eq(cajaTurnos.id, turno.id))
      .returning();
    return actualizado;
  });
}
