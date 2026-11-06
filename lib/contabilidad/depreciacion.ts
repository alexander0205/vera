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
import { CODIGO, asegurarCuentaBase } from './catalogo-base';
import { categoriaActivo } from './activos-fijos';
import { inventarioAulaDisponible, soloControlDisponible } from './activos-espacios';

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

/**
 * ¿Esta ficha genera cuotas de depreciación? No, si es de «solo control» (se cuenta
 * en unidades pero su costo fue al gasto), si es un terreno, si está sin confirmar
 * (abierta desde una compra) o si ya no está activa. Pura: es la regla que aplica
 * el generador además del filtro de la consulta.
 */
export function activoSeDeprecia(a: { soloControl?: boolean | null; enRevision?: boolean | null; categoria?: string | null; activa?: boolean | null }): boolean {
  if (a.soloControl) return false;
  if (a.enRevision) return false;
  if (a.categoria === 'terrenos') return false;
  if (a.activa === false) return false;
  return true;
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

export interface BajaParaCuota {
  /** 'YYYY-MM-DD'. */
  fecha: string;
  unidades: number;
}

/**
 * Las cuotas mensuales de un activo cuando se han dado de baja unidades: cada
 * cuota se reduce en proporción a las unidades que seguían en pie al empezar
 * ese mes. Una baja a mitad de mes afecta desde el mes siguiente (el mes de la
 * baja ya se depreció completo, igual que el mes de la compra no depreciaba).
 *
 * Con `cantidad` = 1 y sin bajas es exactamente `calcularCuotas`.
 */
export function calcularCuotasConBajas(
  activo: ActivoParaDepreciar & { cantidad: number },
  bajas: readonly BajaParaCuota[],
  mesActual: string,
): CuotaDepreciacion[] {
  const base = calcularCuotas(activo, mesActual);
  if (bajas.length === 0 || activo.cantidad <= 1) return base;
  return base
    .map((c) => {
      const dadas = bajas.filter((b) => b.fecha < c.periodo).reduce((s, b) => s + b.unidades, 0);
      const quedan = Math.max(0, activo.cantidad - dadas);
      return { periodo: c.periodo, montoCents: Math.round((c.montoCents * quedan) / activo.cantidad) };
    })
    .filter((c) => c.montoCents > 0);
}

/** El periodo de la última cuota de la vida útil de un activo ('YYYY-MM-01'). */
export function periodoFinalDeVida(fechaAdquisicion: string, vidaUtilMeses: number): string {
  return sumarMeses(sumarMeses(primerDiaDelMes(fechaAdquisicion), 1), vidaUtilMeses - 1);
}

/**
 * Ajusta las cuotas que faltan por asentar para que la depreciación NUNCA pase
 * de lo que se puede depreciar: `techoCents` = costo vigente − residual vigente
 * − lo ya acumulado de lo que queda. Cada cuota se recorta a lo que reste, y la
 * de la última mes de la vida útil cierra exacto contra el techo (absorbe los
 * centavos de redondear cuotas proporcionales tras una baja parcial).
 *
 * `pendientes` va en orden de periodo y debe incluir todas las que faltan.
 */
export function ajustarCuotasPendientes(
  pendientes: readonly CuotaDepreciacion[],
  periodoFinal: string,
  techoCents: number,
): CuotaDepreciacion[] {
  let resto = Math.max(0, techoCents);
  const out: CuotaDepreciacion[] = [];
  for (const c of pendientes) {
    const monto = c.periodo >= periodoFinal ? resto : Math.min(c.montoCents, resto);
    if (monto > 0) out.push({ periodo: c.periodo, montoCents: monto });
    resto -= monto;
  }
  return out;
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
  /** Unidades iguales que cubre la ficha (30 butacas). Por defecto 1. */
  cantidad?:          number;
  /** Dónde está (aula, oficina…). */
  ubicacion?:         string | null;
  /** Clave de `CATEGORIAS_ACTIVO`: decide la cuenta del activo y la de su depreciación acumulada. */
  categoria?:         string | null;
  /**
   * Solo control de inventario: se cuenta en unidades pero no se deprecia ni
   * genera asientos (cosas baratas que se fueron al gasto). Pide la migración 0236.
   */
  soloControl?:       boolean;
}

const tablaCompleta = { vista: false };
/**
 * ¿Ya corrió la migración 0225 (cantidad, ubicación, categoría, bajas)? Se
 * pregunta a la base y solo se recuerda el «sí»: sin ella todo sigue funcionando
 * como antes, con una unidad y las cuentas globales.
 */
export async function activosCompletosDisponible(): Promise<boolean> {
  if (tablaCompleta.vista) return true;
  const filas = await db.execute(sql`
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'contabilidad_activos_fijos' AND column_name = 'cantidad'
    LIMIT 1`) as unknown as unknown[];
  const hay = filas.length > 0
    && ((await db.execute(sql`SELECT to_regclass('public.contabilidad_activos_bajas') IS NOT NULL AS existe`)) as unknown as { existe: boolean }[])[0]?.existe === true;
  if (hay) tablaCompleta.vista = true;
  return hay;
}

/** Registra un activo fijo. Valida las mismas reglas que el CHECK de la tabla. */
export async function registrarActivoFijo(
  teamId: number,
  input: NuevoActivoFijoInput,
  userId: number | null,
  extra: { enRevision?: boolean; compraId?: number; compraLinea?: number; espacioId?: number | null; estado?: 'bien' | 'regular' | 'danado' } = {},
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
  // Un terreno no se deprecia: la columna de vida útil es obligatoria, así que lleva 1 y nunca genera cuotas.
  if (categoriaActivo(input.categoria)?.deprecia === false && !(input.vidaUtilMeses > 0)) input = { ...input, vidaUtilMeses: 1 };
  // «Solo control»: no hay vida útil ni residual que valgan; lleva 1 mes y residual 0 y nunca genera cuotas ni toca cuentas.
  if (input.soloControl) input = { ...input, vidaUtilMeses: 1, valorResidualCents: 0, categoria: null };
  if (!Number.isInteger(input.vidaUtilMeses) || input.vidaUtilMeses <= 0) {
    throw new ActivoFijoError('La vida útil tiene que ser de al menos un mes.');
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.fechaAdquisicion)) {
    throw new ActivoFijoError('La fecha de adquisición no es válida.');
  }
  const cantidad = input.cantidad ?? 1;
  if (!Number.isInteger(cantidad) || cantidad < 1 || cantidad > 100_000) {
    throw new ActivoFijoError('La cantidad tiene que ser un número entero de al menos 1.');
  }
  const ubicacion = input.ubicacion?.replace(/\s+/g, ' ').trim().slice(0, 160) || null;
  const categoria = input.categoria ? categoriaActivo(input.categoria) : null;
  if (input.categoria && !categoria) throw new ActivoFijoError('La categoría del activo no es válida.');

  const completas = await activosCompletosDisponible();
  const pideInventario = !!input.soloControl || extra.espacioId != null || (extra.estado != null && extra.estado !== 'bien');
  if (pideInventario && !(await inventarioAulaDisponible())) {
    throw new ActivoFijoError('El aula, el estado y «solo control» necesitan una actualización de la base que aún no se aplica.');
  }
  if (extra.espacioId != null) {
    const [e] = await db.execute(sql`SELECT id FROM escolar_espacios WHERE id = ${extra.espacioId} AND team_id = ${teamId}`) as unknown as { id: number }[];
    if (!e) throw new ActivoFijoError('El aula no existe.');
  }
  if (!completas) {
    if (cantidad > 1 || ubicacion || categoria || extra.enRevision || extra.compraId) {
      throw new ActivoFijoError('Cantidad, ubicación y categoría necesitan una actualización de la base que aún no se aplica.');
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

  // Las cuentas de su categoría (se crean si el catálogo es anterior a ellas).
  let cuentaActivo: number | null = null;
  let cuentaDeprec: number | null = null;
  if (categoria && categoria.clave !== 'otros') {
    cuentaActivo = await asegurarCuentaBase(teamId, categoria.cuentaActivo, userId ?? undefined);
    cuentaDeprec = await asegurarCuentaBase(teamId, categoria.cuentaDeprecAcum, userId ?? undefined);
  }

  const rows = await db.execute(sql`
    INSERT INTO contabilidad_activos_fijos
      (team_id, nombre, costo_cents, valor_residual_cents, vida_util_meses, fecha_adquisicion, created_by,
       cantidad, ubicacion, categoria, cuenta_activo_id, cuenta_deprec_acum_id, en_revision, compra_id, compra_linea)
    VALUES (${teamId}, ${nombre}, ${input.costoCents}, ${input.valorResidualCents},
            ${input.vidaUtilMeses}, ${input.fechaAdquisicion}, ${userId},
            ${cantidad}, ${ubicacion}, ${categoria?.clave ?? null}, ${cuentaActivo}, ${cuentaDeprec},
            ${extra.enRevision ?? false}, ${extra.compraId ?? null}, ${extra.compraLinea ?? null})
    ON CONFLICT (team_id, compra_id, compra_linea) WHERE compra_id IS NOT NULL DO NOTHING
    RETURNING id
  `);
  const id = (rows as unknown as { id: number }[])[0]?.id ?? 0;
  // Aula, estado y «solo control» (migración 0236): se anotan justo después del alta.
  if (id && pideInventario) {
    await db.execute(sql`
      UPDATE contabilidad_activos_fijos
      SET espacio_id = ${extra.espacioId ?? null}, estado = ${extra.estado ?? 'bien'}, solo_control = ${!!input.soloControl}
      WHERE id = ${id} AND team_id = ${teamId}`);
  }
  return id;
}

/** Un activo fijo con su depreciación acumulada y su valor en libros. */
export interface ActivoFijoResumen {
  id:                 number;
  nombre:             string;
  /** Costo ORIGINAL de todas las unidades. */
  costoCents:         number;
  valorResidualCents: number;
  vidaUtilMeses:      number;
  fechaAdquisicion:   string;
  /** false = ya no queda ninguna unidad (todas dadas de baja). */
  activa:             boolean;
  /** Suma de las cuotas ya generadas. */
  acumuladaCents:     number;
  /** Cuántas cuotas mensuales lleva depreciadas. */
  cuotasHechas:       number;
  /** Unidades que cubría la ficha al comprarse y las que quedan. */
  cantidad:           number;
  cantidadVigente:    number;
  ubicacion:          string | null;
  categoria:          string | null;
  /** Ficha abierta desde una compra: falta confirmar categoría y vida útil. */
  enRevision:         boolean;
  compraId:           number | null;
  /** Costo de lo que queda (original − bajas). */
  costoVigenteCents:  number;
  /** Depreciación de lo que queda (acumulada − la que se fue con las bajas). */
  acumuladaVigenteCents: number;
  /** costoVigente − acumuladaVigente: lo que vale en libros lo que queda. */
  valorLibrosCents:   number;
  bajas:              { unidades: number; costoCents: number; deprecCents: number };
  /** Aula o espacio donde está (migración 0236). Null = sin aula. */
  espacioId:          number | null;
  /** bien | regular | danado. */
  estado:             string;
  /** Se cuenta en unidades pero no se deprecia. */
  soloControl:        boolean;
}

/** Lista los activos fijos del team con acumulada y valor en libros en una consulta. */
export async function listarActivosFijos(teamId: number): Promise<ActivoFijoResumen[]> {
  const completas = await activosCompletosDisponible();
  const inventario = completas && await inventarioAulaDisponible();
  const rows = (await db.execute(sql`
    SELECT a.id, a.nombre,
           a.costo_cents AS "costoCents",
           a.valor_residual_cents AS "valorResidualCents",
           a.vida_util_meses AS "vidaUtilMeses",
           to_char(a.fecha_adquisicion, 'YYYY-MM-DD') AS "fechaAdquisicion",
           a.activa,
           COALESCE(d.acumulada, 0) AS "acumuladaCents",
           COALESCE(d.cuotas, 0)    AS "cuotasHechas"
           ${completas ? sql`,
           a.cantidad, a.ubicacion, a.categoria, a.en_revision AS "enRevision", a.compra_id AS "compraId",
           COALESCE(b.unidades, 0) AS "bajasUnidades",
           COALESCE(b.costo, 0)    AS "bajasCosto",
           COALESCE(b.deprec, 0)   AS "bajasDeprec"` : sql``}
           ${inventario ? sql`, a.espacio_id AS "espacioId", a.estado, a.solo_control AS "soloControl"` : sql``}
    FROM contabilidad_activos_fijos a
    LEFT JOIN (
      SELECT activo_id, sum(monto_cents) AS acumulada, count(*) AS cuotas
      FROM contabilidad_depreciaciones
      WHERE team_id = ${teamId}
      GROUP BY activo_id
    ) d ON d.activo_id = a.id
    ${completas ? sql`LEFT JOIN (
      SELECT activo_id, sum(unidades) AS unidades, sum(costo_baja_cents) AS costo, sum(deprec_baja_cents) AS deprec
      FROM contabilidad_activos_bajas
      WHERE team_id = ${teamId}
      GROUP BY activo_id
    ) b ON b.activo_id = a.id` : sql``}
    WHERE a.team_id = ${teamId}
    ORDER BY a.activa DESC, a.id DESC
  `)) as unknown as Array<Record<string, unknown>>;

  return rows.map((r) => {
    const costo = Number(r.costoCents);
    const acumulada = Number(r.acumuladaCents);
    const cantidad = Number(r.cantidad ?? 1);
    const bajas = { unidades: Number(r.bajasUnidades ?? 0), costoCents: Number(r.bajasCosto ?? 0), deprecCents: Number(r.bajasDeprec ?? 0) };
    const costoVigente = costo - bajas.costoCents;
    const acumuladaVigente = acumulada - bajas.deprecCents;
    return {
      id: Number(r.id), nombre: String(r.nombre),
      costoCents: costo, valorResidualCents: Number(r.valorResidualCents), vidaUtilMeses: Number(r.vidaUtilMeses),
      fechaAdquisicion: String(r.fechaAdquisicion), activa: Boolean(r.activa),
      acumuladaCents: acumulada, cuotasHechas: Number(r.cuotasHechas),
      cantidad, cantidadVigente: cantidad - bajas.unidades,
      ubicacion: (r.ubicacion as string | null) ?? null, categoria: (r.categoria as string | null) ?? null,
      enRevision: Boolean(r.enRevision), compraId: r.compraId == null ? null : Number(r.compraId),
      costoVigenteCents: costoVigente, acumuladaVigenteCents: acumuladaVigente,
      valorLibrosCents: costoVigente - acumuladaVigente, bajas,
      espacioId: r.espacioId == null ? null : Number(r.espacioId),
      estado: r.estado ? String(r.estado) : 'bien',
      soloControl: r.soloControl === true,
    };
  });
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
  const completas = await activosCompletosDisponible();
  // Las fichas de «solo control» (migración 0236) no se deprecian: se saltan en la consulta y otra vez abajo.
  const hayControl = await soloControlDisponible();

  const activos = (await db.execute(sql`
    SELECT id, nombre, costo_cents AS "costoCents",
           valor_residual_cents AS "valorResidualCents",
           vida_util_meses AS "vidaUtilMeses",
           to_char(fecha_adquisicion, 'YYYY-MM-DD') AS "fechaAdquisicion"
           ${completas ? sql`,
           cantidad, cuenta_deprec_acum_id AS "cuentaDeprecAcumId", cuenta_gasto_deprec_id AS "cuentaGastoDeprecId"` : sql``}
           ${hayControl ? sql`, solo_control AS "soloControl"` : sql``}
    FROM contabilidad_activos_fijos
    WHERE team_id = ${teamId} AND activa = true
      -- Un terreno no se deprecia, y una ficha sin confirmar (abierta desde una compra) tampoco hasta que se confirme.
      ${completas ? sql`AND NOT en_revision AND COALESCE(categoria, '') <> 'terrenos'` : sql``}
      ${hayControl ? sql`AND NOT solo_control` : sql``}
    ORDER BY id
  `)) as unknown as Array<{
    id: number; nombre: string; costoCents: number; valorResidualCents: number;
    vidaUtilMeses: number; fechaAdquisicion: string;
    cantidad?: number; cuentaDeprecAcumId?: number | null; cuentaGastoDeprecId?: number | null;
    soloControl?: boolean;
  }>;

  // Las bajas por activo, para que la cuota baje con las unidades que quedan.
  const bajasPorActivo = new Map<number, BajaParaCuota[]>();
  const totalesBajas = new Map<number, { unidades: number; costo: number; deprec: number }>();
  if (completas && activos.length > 0) {
    const bajas = (await db.execute(sql`
      SELECT activo_id AS "activoId", to_char(fecha, 'YYYY-MM-DD') AS fecha, unidades,
             costo_baja_cents AS costo, deprec_baja_cents AS deprec
      FROM contabilidad_activos_bajas WHERE team_id = ${teamId}
    `)) as unknown as Array<{ activoId: number; fecha: string; unidades: number; costo: unknown; deprec: unknown }>;
    for (const b of bajas) {
      const lista = bajasPorActivo.get(Number(b.activoId)) ?? [];
      lista.push({ fecha: b.fecha, unidades: Number(b.unidades) });
      bajasPorActivo.set(Number(b.activoId), lista);
      const t = totalesBajas.get(Number(b.activoId)) ?? { unidades: 0, costo: 0, deprec: 0 };
      t.unidades += Number(b.unidades); t.costo += Number(b.costo); t.deprec += Number(b.deprec);
      totalesBajas.set(Number(b.activoId), t);
    }
  }

  for (const a of activos) {
    if (!activoSeDeprecia({ soloControl: a.soloControl })) continue;
    resumen.activosProcesados++;

    const yaHechas = (await db.execute(sql`
      SELECT to_char(periodo, 'YYYY-MM-DD') AS periodo, monto_cents AS monto
      FROM contabilidad_depreciaciones
      WHERE team_id = ${teamId} AND activo_id = ${a.id}
    `)) as unknown as Array<{ periodo: string; monto: unknown }>;
    const hechas = new Set(yaHechas.map((r) => r.periodo));
    const acumulada = yaHechas.reduce((t, r) => t + Number(r.monto), 0);

    const cantidadOriginal = Number(a.cantidad ?? 1);
    const tb = totalesBajas.get(a.id) ?? { unidades: 0, costo: 0, deprec: 0 };
    const quedan = Math.max(0, cantidadOriginal - tb.unidades);
    const pendientes = calcularCuotasConBajas(
      {
        costoCents: Number(a.costoCents),
        valorResidualCents: Number(a.valorResidualCents),
        vidaUtilMeses: Number(a.vidaUtilMeses),
        fechaAdquisicion: a.fechaAdquisicion,
        cantidad: cantidadOriginal,
      },
      bajasPorActivo.get(a.id) ?? [],
      mesActual,
    ).filter((c) => !hechas.has(c.periodo));
    // Lo que todavía se puede depreciar de lo que queda: nunca más que el costo menos el residual.
    const residualVigente = Math.round((Number(a.valorResidualCents) * quedan) / cantidadOriginal);
    const techo = Number(a.costoCents) - tb.costo - residualVigente - (acumulada - tb.deprec);
    const cuotas = ajustarCuotasPendientes(pendientes, periodoFinalDeVida(a.fechaAdquisicion, Number(a.vidaUtilMeses)), techo);

    // La depreciación acumulada de su categoría, si la ficha la tiene; si no, la global.
    const acumDelActivo = a.cuentaDeprecAcumId ?? cuentaAcum;
    const gastoDelActivo = a.cuentaGastoDeprecId ?? cuentaGasto;

    for (const cuota of cuotas) {
      const creado = await asentarCuota(
        teamId, a.id, a.nombre, cuota, gastoDelActivo, acumDelActivo, userId,
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
