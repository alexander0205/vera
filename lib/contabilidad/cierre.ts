import { cache } from 'react';
/**
 * lib/contabilidad/cierre.ts — Cierre de ejercicio (cierre anual).
 *
 * Al terminar el año fiscal (31-dic en RD), un asiento de cierre vacía las
 * cuentas de resultado —ingresos (4), costos (5), gastos (6)— y manda el neto a
 * 3102 Resultados acumulados:
 *
 *   por cada cuenta 4/5/6 con saldo: se apunta el importe contrario que la deja
 *   en cero;  el neto (utilidad o pérdida) cuadra contra 3102.
 *
 * Detalles que importan:
 *  - **Método directo a 3102**, sin cuenta puente de Pérdidas y Ganancias (v1).
 *  - **Idempotente y secuencial:** UNIQUE (team, ejercicio) impide cerrar dos
 *    veces; y no se puede cerrar un año si queda un ejercicio anterior sin cerrar
 *    (su resultado contaminaría el del año en curso).
 *  - **Reversible:** reabrir borra el asiento de cierre y su registro, devolviendo
 *    las cuentas de resultado a su estado abierto. Un asiento de cierre es una
 *    pieza mecánica derivada, no un documento: borrarlo al reabrir es correcto.
 *  - El **estado de resultados excluye** los asientos de cierre (ver
 *    `estado-resultados.ts`); el **balance general los cuenta** (el resultado ya
 *    vive en 3102 tras cerrar). Así los dos reportes cuadran antes y después.
 */

import { db } from '@/lib/db/drizzle';
import { sql } from 'drizzle-orm';
import { hoyRD } from '@/lib/utils/format';
import { balanceComprobacion } from './reportes';

const CODIGO_RESULTADOS_ACUM = '3102';

export interface LineaCierre {
  cuentaId:    number;
  debeCents:   number;
  haberCents:  number;
  descripcion: string;
}

/** Una cuenta de resultado con su saldo neto del ejercicio. */
export interface SaldoResultado {
  cuentaId:  number;
  codigo:    string;
  nombre:    string;
  /** debe − haber acumulado. Positivo = saldo deudor (gastos/costos). */
  netoCents: number;
}

export interface ResultadoConstruccion {
  lineas:         LineaCierre[];
  /** Utilidad (+) o pérdida (−) del ejercicio. */
  resultadoCents: number;
}

/**
 * Arma las líneas del asiento de cierre a partir de los saldos de resultado.
 * Función PURA (sin base) para poder probar el álgebra del cierre.
 *
 * Cada cuenta se lleva a cero con el importe contrario a su saldo; el neto de
 * todo se apunta a 3102. Si el neto es cero (ingresos = gastos), no se añade la
 * línea de 3102: las de resultado ya cuadran entre sí.
 */
export function construirLineasCierre(
  saldos: SaldoResultado[],
  cuentaResultadosAcumId: number,
): ResultadoConstruccion {
  const lineas: LineaCierre[] = [];
  let sumaDebe = 0;
  let sumaHaber = 0;

  for (const s of saldos) {
    if (s.netoCents === 0) continue;
    // Saldo deudor (neto>0) → se acredita para cerrarlo; acreedor → se debita.
    const debe  = s.netoCents < 0 ? -s.netoCents : 0;
    const haber = s.netoCents > 0 ?  s.netoCents : 0;
    lineas.push({ cuentaId: s.cuentaId, debeCents: debe, haberCents: haber, descripcion: `Cierre ${s.codigo} ${s.nombre}` });
    sumaDebe  += debe;
    sumaHaber += haber;
  }

  // Utilidad = lo que se acreditó menos lo que se debitó al vaciar las cuentas.
  // (Ingresos son acreedores → salen al debe; gastos deudores → al haber.)
  const resultadoCents = sumaDebe - sumaHaber;
  if (resultadoCents > 0) {
    lineas.push({ cuentaId: cuentaResultadosAcumId, debeCents: 0, haberCents: resultadoCents, descripcion: 'Utilidad del ejercicio a resultados acumulados' });
  } else if (resultadoCents < 0) {
    lineas.push({ cuentaId: cuentaResultadosAcumId, debeCents: -resultadoCents, haberCents: 0, descripcion: 'Pérdida del ejercicio a resultados acumulados' });
  }

  return { lineas, resultadoCents };
}

/** Error de regla de negocio del cierre. La API lo traduce a 400/409. */
export class CierreError extends Error {
  constructor(message: string, readonly status: number = 409) {
    super(message);
    this.name = 'CierreError';
  }
}

const cuentaPorCodigo = cache(async function cuentaPorCodigo(teamId: number, codigo: string): Promise<number | null> {
  const rows = await db.execute(sql`
    SELECT id FROM contabilidad_cuentas
    WHERE team_id = ${teamId} AND codigo = ${codigo} AND imputable AND activa
    LIMIT 1
  `);
  return (rows as unknown as { id: number }[])[0]?.id ?? null;
});

/** Saldos de las cuentas de resultado (4/5/6) hasta el 31-dic del ejercicio. */
async function saldosResultado(teamId: number, ejercicio: number): Promise<SaldoResultado[]> {
  const bal = await balanceComprobacion(teamId, { hasta: `${ejercicio}-12-31` });
  return bal.filas
    .filter((f) => f.tipo === 'ingreso' || f.tipo === 'costo' || f.tipo === 'gasto')
    .map((f) => ({ cuentaId: f.cuentaId, codigo: f.codigo, nombre: f.nombre, netoCents: f.debeCents - f.haberCents }))
    .filter((s) => s.netoCents !== 0);
}

/** Neto de las cuentas de resultado antes del 1-ene del ejercicio (para el guardián de secuencia). */
async function saldoResultadoPrevio(teamId: number, ejercicio: number): Promise<number> {
  const bal = await balanceComprobacion(teamId, { hasta: `${ejercicio - 1}-12-31` });
  return bal.filas
    .filter((f) => f.tipo === 'ingreso' || f.tipo === 'costo' || f.tipo === 'gasto')
    .reduce((s, f) => s + (f.debeCents - f.haberCents), 0);
}

export interface PrevisualizacionCierre {
  ejercicio:      number;
  fechaCierre:    string;
  saldos:         SaldoResultado[];
  resultadoCents: number;
  /** null si se puede cerrar; si no, el motivo en lenguaje de usuario. */
  bloqueo:        string | null;
  yaCerrado:      boolean;
}

/** Previsualiza el cierre de un año: qué cuentas se cierran y el resultado. Sin escribir. */
export async function previsualizarCierre(teamId: number, ejercicio: number): Promise<PrevisualizacionCierre> {
  const fechaCierre = `${ejercicio}-12-31`;
  const [{ n: yaN }] = (await db.execute(sql`
    SELECT count(*)::int n FROM contabilidad_cierres WHERE team_id = ${teamId} AND ejercicio = ${ejercicio}
  `)) as unknown as { n: number }[];
  const yaCerrado = yaN > 0;

  const saldos = await saldosResultado(teamId, ejercicio);
  const resultadoCents = saldos.reduce((s, x) => s + (-x.netoCents), 0); // ingresos(−neto) − gastos(+neto)

  let bloqueo: string | null = null;
  if (yaCerrado) {
    bloqueo = `El ejercicio ${ejercicio} ya está cerrado.`;
  } else if (fechaCierre > hoyRD()) {
    bloqueo = `El ejercicio ${ejercicio} todavía no ha terminado. Se cierra a partir del 31 de diciembre de ${ejercicio}.`;
  } else if (saldos.length === 0) {
    bloqueo = `No hay resultados que cerrar en ${ejercicio}.`;
  } else if ((await saldoResultadoPrevio(teamId, ejercicio)) !== 0) {
    bloqueo = `Hay un ejercicio anterior a ${ejercicio} sin cerrar. Cierra los años en orden, del más antiguo al más reciente.`;
  }

  return { ejercicio, fechaCierre, saldos, resultadoCents, bloqueo, yaCerrado };
}

export interface ResultadoCierre {
  cierreId:       number;
  asientoId:      number;
  resultadoCents: number;
}

/** Cierra un ejercicio: postea el asiento de cierre y registra el cierre. */
export async function cerrarEjercicio(teamId: number, ejercicio: number, userId: number | null): Promise<ResultadoCierre> {
  const prev = await previsualizarCierre(teamId, ejercicio);
  if (prev.bloqueo) throw new CierreError(prev.bloqueo);

  const cuenta3102 = await cuentaPorCodigo(teamId, CODIGO_RESULTADOS_ACUM);
  if (!cuenta3102) {
    throw new CierreError(`Falta la cuenta ${CODIGO_RESULTADOS_ACUM} Resultados acumulados en el catálogo. Usa "Restaurar cuentas base".`);
  }

  const { lineas, resultadoCents } = construirLineasCierre(prev.saldos, cuenta3102);
  const debe  = lineas.reduce((s, l) => s + l.debeCents, 0);
  const haber = lineas.reduce((s, l) => s + l.haberCents, 0);
  if (debe !== haber) throw new CierreError('El asiento de cierre no cuadra. No se guardó nada.', 500);

  return db.transaction(async (tx) => {
    const cierreRows = await tx.execute(sql`
      INSERT INTO contabilidad_cierres (team_id, ejercicio, fecha_cierre, resultado_cents, created_by)
      VALUES (${teamId}, ${ejercicio}, ${prev.fechaCierre}, ${resultadoCents}, ${userId})
      ON CONFLICT (team_id, ejercicio) DO NOTHING
      RETURNING id
    `);
    const cierreId = (cierreRows as unknown as { id: number }[])[0]?.id;
    if (!cierreId) throw new CierreError(`El ejercicio ${ejercicio} ya está cerrado.`);

    const asientoRows = await tx.execute(sql`
      INSERT INTO contabilidad_asientos (team_id, fecha, concepto, origen_tipo, origen_id, total_cents, created_by)
      VALUES (${teamId}, ${prev.fechaCierre}, ${`Cierre de ejercicio ${ejercicio}`}, 'cierre', ${cierreId}, ${debe}, ${userId})
      RETURNING id
    `);
    const asientoId = (asientoRows as unknown as { id: number }[])[0].id;

    let orden = 0;
    for (const l of lineas) {
      await tx.execute(sql`
        INSERT INTO contabilidad_asiento_lineas (asiento_id, team_id, cuenta_id, debe_cents, haber_cents, descripcion, orden)
        VALUES (${asientoId}, ${teamId}, ${l.cuentaId}, ${l.debeCents}, ${l.haberCents}, ${l.descripcion}, ${orden++})
      `);
    }

    await tx.execute(sql`UPDATE contabilidad_cierres SET asiento_id = ${asientoId} WHERE id = ${cierreId}`);
    return { cierreId, asientoId, resultadoCents };
  });
}

/** Reabre un ejercicio: borra el asiento de cierre y su registro. Solo el más reciente. */
export async function reabrirEjercicio(teamId: number, ejercicio: number): Promise<void> {
  const rows = (await db.execute(sql`
    SELECT id, asiento_id AS "asientoId" FROM contabilidad_cierres
    WHERE team_id = ${teamId} AND ejercicio = ${ejercicio}
  `)) as unknown as { id: number; asientoId: number | null }[];
  const cierre = rows[0];
  if (!cierre) throw new CierreError(`El ejercicio ${ejercicio} no está cerrado.`, 404);

  const [{ maxEj }] = (await db.execute(sql`
    SELECT max(ejercicio)::int AS "maxEj" FROM contabilidad_cierres WHERE team_id = ${teamId}
  `)) as unknown as { maxEj: number }[];
  if (maxEj !== null && maxEj > ejercicio) {
    throw new CierreError(`Reabre primero el ejercicio ${maxEj}: los años se reabren del más reciente al más antiguo.`);
  }

  await db.transaction(async (tx) => {
    // El registro de cierre referencia el asiento (FK), así que se borra primero.
    await tx.execute(sql`DELETE FROM contabilidad_cierres WHERE id = ${cierre.id}`);
    if (cierre.asientoId !== null) {
      await tx.execute(sql`DELETE FROM contabilidad_asiento_lineas WHERE asiento_id = ${cierre.asientoId}`);
      await tx.execute(sql`DELETE FROM contabilidad_asientos WHERE id = ${cierre.asientoId}`);
    }
  });
}

export interface CierreRegistrado {
  ejercicio:      number;
  fechaCierre:    string;
  resultadoCents: number;
  asientoId:      number | null;
  esUltimo:       boolean;
}

/** Los cierres registrados, del más reciente al más antiguo. */
export async function listarCierres(teamId: number): Promise<CierreRegistrado[]> {
  const rows = (await db.execute(sql`
    SELECT ejercicio, to_char(fecha_cierre, 'YYYY-MM-DD') AS "fechaCierre",
           resultado_cents AS "resultadoCents", asiento_id AS "asientoId"
    FROM contabilidad_cierres WHERE team_id = ${teamId} ORDER BY ejercicio DESC
  `)) as unknown as Array<{ ejercicio: number; fechaCierre: string; resultadoCents: unknown; asientoId: number | null }>;

  return rows.map((r, i) => ({
    ejercicio: r.ejercicio,
    fechaCierre: r.fechaCierre,
    resultadoCents: Number(r.resultadoCents),
    asientoId: r.asientoId,
    esUltimo: i === 0,   // el primero es el ejercicio más alto = el reabrible
  }));
}

/** Años con actividad de resultado, para ofrecer en el selector de cierre. */
export async function aniosConActividad(teamId: number): Promise<number[]> {
  const rows = (await db.execute(sql`
    SELECT DISTINCT extract(year FROM a.fecha)::int AS anio
    FROM contabilidad_asientos a
    JOIN contabilidad_asiento_lineas l ON l.asiento_id = a.id
    JOIN contabilidad_cuentas c ON c.id = l.cuenta_id
    WHERE a.team_id = ${teamId} AND a.origen_tipo <> 'cierre'
      AND c.tipo IN ('ingreso', 'costo', 'gasto')
    ORDER BY anio DESC
  `)) as unknown as { anio: number }[];
  return rows.map((r) => r.anio);
}
