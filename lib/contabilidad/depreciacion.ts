/**
 * lib/contabilidad/depreciacion.ts — Depreciación lineal automática de los
 * activos fijos. Nivel 4.2 del plan de pendientes.
 *
 * El sistema genera una cuota de depreciación por mes y por activo, con el
 * método lineal (el que describió el contador del cliente):
 *
 *   cuota = (costo − valor residual) / vida útil en meses
 *
 * y el asiento mensual:
 *
 *   Debe  6103 Gasto por depreciación   la cuota del mes
 *     Haber  1202 Depreciación acumulada  (contra-activo)
 *
 * La depreciación NO saca dinero de la caja: solo reconoce el desgaste. Por eso
 * la contrapartida es 1202 (que resta del activo), no 1101.
 *
 * Dos garantías de idempotencia, como el resto del motor:
 *   - UNIQUE (team, activo, periodo) en `contabilidad_depreciaciones`: un activo
 *     no se deprecia dos veces el mismo mes.
 *   - índice único (team, origen_tipo, origen_id) del asiento: la cuota produce
 *     exactamente un asiento.
 * Row de cuota y asiento se insertan en la MISMA transacción, así que un fallo a
 * medias no deja una cuota sin su asiento.
 */

import { db } from '@/lib/db/drizzle';
import { sql } from 'drizzle-orm';
import { hoyRD } from '@/lib/utils/format';
import { getConfig } from './config';
import { CODIGO } from './catalogo-base';

/** Una cuota mensual pendiente de un activo. `periodo` = 'YYYY-MM-01'. */
export interface CuotaDepreciacion {
  periodo:    string;
  montoCents: number;
}

/** Datos de un activo que necesita el cálculo de la cuota. Todo en centavos. */
export interface ActivoParaDepreciar {
  costoCents:          number;
  valorResidualCents:  number;
  vidaUtilMeses:       number;
  /** 'YYYY-MM-DD'. */
  fechaAdquisicion:    string;
}

/** Suma n meses a un 'YYYY-MM-01', devolviendo otro 'YYYY-MM-01'. */
function sumarMeses(periodo: string, n: number): string {
  const [y, m] = periodo.split('-').map(Number);
  const total = (y * 12 + (m - 1)) + n;       // meses absolutos desde el año 0
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  return `${ny}-${String(nm).padStart(2, '0')}-01`;
}

/** El primer día del mes de una fecha 'YYYY-MM-DD'. */
function primerDiaDelMes(fecha: string): string {
  return `${fecha.slice(0, 7)}-01`;
}

/**
 * Calcula todas las cuotas de depreciación de un activo desde su adquisición
 * hasta `mesActual` (inclusive), función PURA para poder probarla sin base.
 *
 * Convención: la primera cuota es la del mes SIGUIENTE al de adquisición (lo
 * común: un activo comprado a mitad de mes empieza a depreciar el mes entero
 * siguiente). El total nunca baja del valor residual: **la última cuota (la de
 * la vida útil) absorbe el redondeo** para que la suma sea exactamente
 * `costo − residual`.
 *
 * Devuelve todas las cuotas hasta la fecha; el llamador descarta las que ya
 * estén registradas. No incluye cuotas de monto 0 (no hay nada que asentar).
 */
export function calcularCuotas(
  activo: ActivoParaDepreciar,
  mesActual: string,   // 'YYYY-MM-DD' o 'YYYY-MM-01'
): CuotaDepreciacion[] {
  const base = activo.costoCents - activo.valorResidualCents;
  if (base <= 0 || activo.vidaUtilMeses <= 0) return [];

  const cuotaRegular = Math.round(base / activo.vidaUtilMeses);
  // La última cuota cierra la diferencia: así la suma da `base` exacto y nunca
  // se deprecia por debajo del residual, pase lo que pase con el redondeo.
  const cuotaFinal = base - cuotaRegular * (activo.vidaUtilMeses - 1);

  const primerMes = sumarMeses(primerDiaDelMes(activo.fechaAdquisicion), 1);
  const tope      = primerDiaDelMes(mesActual);

  const cuotas: CuotaDepreciacion[] = [];
  for (let k = 1; k <= activo.vidaUtilMeses; k++) {
    const periodo = sumarMeses(primerMes, k - 1);
    if (periodo > tope) break;   // aún no vencida: comparar 'YYYY-MM-01' lexicográfico
    const montoCents = k < activo.vidaUtilMeses ? cuotaRegular : cuotaFinal;
    if (montoCents > 0) cuotas.push({ periodo, montoCents });
  }
  return cuotas;
}

/** Resumen de una corrida de depreciación de un team. */
export interface ResumenDepreciacion {
  creados:           number;
  activosProcesados: number;
}

/** Por qué una corrida no pudo asentar. Se registra en el resumen del cron. */
export class DepreciacionSinCuentaError extends Error {
  constructor(readonly codigo: string) {
    super(`Falta la cuenta ${codigo} en el catálogo del team. ` +
          'Usa "Restaurar cuentas base" en el catálogo de contabilidad.');
    this.name = 'DepreciacionSinCuentaError';
  }
}

// ─── Alta y listado ──────────────────────────────────────────────────────────

/** Error de validación de un activo fijo. La API lo traduce a 400. */
export class ActivoFijoError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ActivoFijoError';
  }
}

export interface NuevoActivoFijoInput {
  nombre:             string;
  costoCents:         number;
  valorResidualCents: number;
  vidaUtilMeses:      number;
  /** 'YYYY-MM-DD'. */
  fechaAdquisicion:   string;
}

/** Registra un activo fijo. Valida las mismas reglas que el CHECK de la tabla. */
export async function registrarActivoFijo(
  teamId: number,
  input: NuevoActivoFijoInput,
  userId: number | null,
): Promise<number> {
  const nombre = input.nombre.trim();
  if (!nombre) throw new ActivoFijoError('El activo necesita un nombre.');
  if (!Number.isInteger(input.costoCents) || input.costoCents <= 0) {
    throw new ActivoFijoError('El costo tiene que ser mayor que cero.');
  }
  if (!Number.isInteger(input.valorResidualCents) || input.valorResidualCents < 0) {
    throw new ActivoFijoError('El valor residual no puede ser negativo.');
  }
  if (input.valorResidualCents >= input.costoCents) {
    throw new ActivoFijoError('El valor residual tiene que ser menor que el costo.');
  }
  if (!Number.isInteger(input.vidaUtilMeses) || input.vidaUtilMeses <= 0) {
    throw new ActivoFijoError('La vida útil tiene que ser de al menos un mes.');
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.fechaAdquisicion)) {
    throw new ActivoFijoError('La fecha de adquisición no es válida.');
  }

  const rows = await db.execute(sql`
    INSERT INTO contabilidad_activos_fijos
      (team_id, nombre, costo_cents, valor_residual_cents, vida_util_meses,
       fecha_adquisicion, created_by)
    VALUES (${teamId}, ${nombre}, ${input.costoCents}, ${input.valorResidualCents},
            ${input.vidaUtilMeses}, ${input.fechaAdquisicion}, ${userId})
    RETURNING id
  `);
  return (rows as unknown as { id: number }[])[0].id;
}

/** Un activo fijo con su depreciación acumulada y su valor en libros. */
export interface ActivoFijoResumen {
  id:                 number;
  nombre:             string;
  costoCents:         number;
  valorResidualCents: number;
  vidaUtilMeses:      number;
  fechaAdquisicion:   string;
  activa:             boolean;
  /** Suma de las cuotas ya generadas. */
  acumuladaCents:     number;
  /** costo − acumulada. Lo que vale el activo en los libros hoy. */
  valorLibrosCents:   number;
  /** Cuántas cuotas mensuales lleva depreciadas. */
  cuotasHechas:       number;
}

/** Lista los activos fijos del team con acumulada y valor en libros en una consulta. */
export async function listarActivosFijos(teamId: number): Promise<ActivoFijoResumen[]> {
  const rows = (await db.execute(sql`
    SELECT a.id, a.nombre,
           a.costo_cents AS "costoCents",
           a.valor_residual_cents AS "valorResidualCents",
           a.vida_util_meses AS "vidaUtilMeses",
           to_char(a.fecha_adquisicion, 'YYYY-MM-DD') AS "fechaAdquisicion",
           a.activa,
           COALESCE(d.acumulada, 0) AS "acumuladaCents",
           COALESCE(d.cuotas, 0)    AS "cuotasHechas"
    FROM contabilidad_activos_fijos a
    LEFT JOIN (
      SELECT activo_id, sum(monto_cents) AS acumulada, count(*) AS cuotas
      FROM contabilidad_depreciaciones
      WHERE team_id = ${teamId}
      GROUP BY activo_id
    ) d ON d.activo_id = a.id
    WHERE a.team_id = ${teamId}
    ORDER BY a.activa DESC, a.id DESC
  `)) as unknown as Array<Omit<ActivoFijoResumen, 'valorLibrosCents'>>;

  return rows.map((r) => ({
    ...r,
    costoCents: Number(r.costoCents),
    valorResidualCents: Number(r.valorResidualCents),
    acumuladaCents: Number(r.acumuladaCents),
    cuotasHechas: Number(r.cuotasHechas),
    valorLibrosCents: Number(r.costoCents) - Number(r.acumuladaCents),
  }));
}

/** Resuelve una cuenta por su código base cuando la config no la fija. */
async function cuentaPorCodigo(teamId: number, codigo: string): Promise<number | null> {
  const rows = await db.execute(sql`
    SELECT id FROM contabilidad_cuentas
    WHERE team_id = ${teamId} AND codigo = ${codigo} AND imputable AND activa
    LIMIT 1
  `);
  return (rows as unknown as { id: number }[])[0]?.id ?? null;
}

/**
 * Genera las depreciaciones pendientes de un team: por cada activo activo, las
 * cuotas que le falten hasta el mes actual RD. Idempotente.
 *
 * Requiere las cuentas 6103 (gasto) y 1202 (acumulada), por config o por código
 * base. Si faltan, lanza `DepreciacionSinCuentaError` — el team no las sembró.
 */
export async function generarDepreciacionesPendientes(
  teamId: number,
  userId: number | null = null,
): Promise<ResumenDepreciacion> {
  const resumen: ResumenDepreciacion = { creados: 0, activosProcesados: 0 };

  const cfg = await getConfig(teamId);
  if (!cfg.activa) return resumen;

  const cuentaGasto = cfg.cuentaGastoDeprecId ?? await cuentaPorCodigo(teamId, CODIGO.gastoDepreciacion);
  if (!cuentaGasto) throw new DepreciacionSinCuentaError(CODIGO.gastoDepreciacion);
  const cuentaAcum = cfg.cuentaDeprecAcumId ?? await cuentaPorCodigo(teamId, CODIGO.depreciacionAcum);
  if (!cuentaAcum) throw new DepreciacionSinCuentaError(CODIGO.depreciacionAcum);

  const mesActual = hoyRD();

  const activos = (await db.execute(sql`
    SELECT id, nombre, costo_cents AS "costoCents",
           valor_residual_cents AS "valorResidualCents",
           vida_util_meses AS "vidaUtilMeses",
           to_char(fecha_adquisicion, 'YYYY-MM-DD') AS "fechaAdquisicion"
    FROM contabilidad_activos_fijos
    WHERE team_id = ${teamId} AND activa = true
    ORDER BY id
  `)) as unknown as Array<{
    id: number; nombre: string; costoCents: number; valorResidualCents: number;
    vidaUtilMeses: number; fechaAdquisicion: string;
  }>;

  for (const a of activos) {
    resumen.activosProcesados++;

    const yaHechas = (await db.execute(sql`
      SELECT to_char(periodo, 'YYYY-MM-DD') AS periodo
      FROM contabilidad_depreciaciones
      WHERE team_id = ${teamId} AND activo_id = ${a.id}
    `)) as unknown as Array<{ periodo: string }>;
    const hechas = new Set(yaHechas.map((r) => r.periodo));

    const cuotas = calcularCuotas(
      {
        costoCents: Number(a.costoCents),
        valorResidualCents: Number(a.valorResidualCents),
        vidaUtilMeses: Number(a.vidaUtilMeses),
        fechaAdquisicion: a.fechaAdquisicion,
      },
      mesActual,
    ).filter((c) => !hechas.has(c.periodo));

    for (const cuota of cuotas) {
      const creado = await asentarCuota(
        teamId, a.id, a.nombre, cuota, cuentaGasto, cuentaAcum, userId,
      );
      if (creado) resumen.creados++;
    }
  }

  return resumen;
}

/**
 * Inserta la fila de la cuota y su asiento en una sola transacción.
 *
 *   Debe  6103 Gasto por depreciación
 *     Haber  1202 Depreciación acumulada
 *
 * Devuelve true si creó el asiento, false si la cuota ya existía (idempotencia).
 */
async function asentarCuota(
  teamId: number,
  activoId: number,
  nombre: string,
  cuota: CuotaDepreciacion,
  cuentaGasto: number,
  cuentaAcum: number,
  userId: number | null,
): Promise<boolean> {
  return db.transaction(async (tx) => {
    const depRows = await tx.execute(sql`
      INSERT INTO contabilidad_depreciaciones (team_id, activo_id, periodo, monto_cents)
      VALUES (${teamId}, ${activoId}, ${cuota.periodo}, ${cuota.montoCents})
      ON CONFLICT (team_id, activo_id, periodo) DO NOTHING
      RETURNING id
    `);
    const depId = (depRows as unknown as { id: number }[])[0]?.id;
    if (!depId) return false;   // otra corrida se adelantó: idempotencia

    const concepto = `Depreciación ${cuota.periodo.slice(0, 7)} · ${nombre}`;
    const asientoRows = await tx.execute(sql`
      INSERT INTO contabilidad_asientos
        (team_id, fecha, concepto, origen_tipo, origen_id, total_cents, created_by)
      VALUES (${teamId}, ${cuota.periodo}, ${concepto}, 'depreciacion', ${depId},
              ${cuota.montoCents}, ${userId})
      ON CONFLICT (team_id, origen_tipo, origen_id) DO NOTHING
      RETURNING id
    `);
    const asientoId = (asientoRows as unknown as { id: number }[])[0]?.id;
    if (!asientoId) return false;

    await tx.execute(sql`
      INSERT INTO contabilidad_asiento_lineas
        (asiento_id, team_id, cuenta_id, debe_cents, haber_cents, descripcion, orden)
      VALUES
        (${asientoId}, ${teamId}, ${cuentaGasto}, ${cuota.montoCents}, 0, 'Gasto por depreciación', 0),
        (${asientoId}, ${teamId}, ${cuentaAcum}, 0, ${cuota.montoCents}, 'Depreciación acumulada', 1)
    `);

    await tx.execute(sql`
      UPDATE contabilidad_depreciaciones SET asiento_id = ${asientoId} WHERE id = ${depId}
    `);

    return true;
  });
}
