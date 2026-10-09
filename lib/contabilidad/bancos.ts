/**
 * Bancos: libro banco, movimientos entre cuentas propias, cargos bancarios,
 * depósitos y retiros, y conciliación.
 *
 * No hay un libro aparte: el libro banco es el mayor de una cuenta de caja o
 * banco, partido en lo que entró (débito) y lo que salió (crédito). Los
 * movimientos de aquí son asientos manuales con una forma fija, que cuadran por
 * construcción: así nadie arma a mano la transferencia entre dos bancos con el
 * débito y el crédito al revés.
 *
 * Lo puro (armar y validar un movimiento, escapar el CSV) va aparte de lo que
 * toca la base, para probarlo sin levantarla.
 */

import { sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { cuentasDeSalida } from './config';
import { generarAsientoManual, AsientoManualError, type LineaManualInput } from './asientos';

/** Tope de un movimiento: 100 millones de pesos. */
export const MOVIMIENTO_MAX_CENTS = 10_000_000_000;
/** Un movimiento no se registra con más de este margen hacia el futuro: casi siempre es el año mal tecleado. */
export const DIAS_FUTURO_MAX = 31;
/** Movimientos que devuelve el libro de un tramo; más es un tramo demasiado largo para leerlo. */
export const LIBRO_MAX_MOVIMIENTOS = 5000;
/** Apuntes que se concilian en una sola llamada. */
export const CONCILIAR_MAX = 500;

export class MovimientoBancarioError extends Error {
  constructor(message: string, readonly status = 400) { super(message); this.name = 'MovimientoBancarioError'; }
}

// ─── Lo puro: armar y validar un movimiento ──────────────────────────────────

export type MovimientoBancario =
  | { kind: 'transferencia'; fecha: string; cuentaOrigenId: number; cuentaDestinoId: number; montoCents: number; referencia?: string | null }
  | { kind: 'cargo'; fecha: string; cuentaId: number; cuentaGastoId: number; montoCents: number; concepto?: string | null }
  | { kind: 'deposito'; fecha: string; cuentaId: number; contrapartidaId: number; montoCents: number; concepto?: string | null }
  | { kind: 'retiro'; fecha: string; cuentaId: number; contrapartidaId: number; montoCents: number; concepto?: string | null };

/** Lo que se necesita saber de una cuenta para validar contra ella. */
export interface InfoCuenta {
  id: number;
  codigo: string;
  nombre: string;
  tipo: string;
  imputable: boolean;
  activa: boolean;
}

/** Texto libre de una persona: sin caracteres de control, espacios normalizados, recortado. */
export function textoLibre(v: unknown, max: number): string | null {
  if (typeof v !== 'string') return null;
  // eslint-disable-next-line no-control-regex
  const t = v.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F​-‏‪-‮⁦-⁩﻿]/g, '').replace(/\s+/g, ' ').trim().slice(0, max);
  return t === '' ? null : t;
}

/** Una fecha real 'YYYY-MM-DD' entre 2000 y un mes a futuro de `hoy`. */
export function fechaMovimientoValida(fecha: unknown, hoy: string): fecha is string {
  if (typeof fecha !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return false;
  const [a, m, d] = fecha.split('-').map(Number);
  if (a < 2000) return false;
  const f = new Date(Date.UTC(a, m - 1, d));
  if (f.getUTCFullYear() !== a || f.getUTCMonth() !== m - 1 || f.getUTCDate() !== d) return false;
  const limite = new Date(`${hoy}T00:00:00Z`);
  limite.setUTCDate(limite.getUTCDate() + DIAS_FUTURO_MAX);
  return f.getTime() <= limite.getTime();
}

const ETIQUETA: Record<MovimientoBancario['kind'], string> = {
  transferencia: 'Transferencia entre cuentas', cargo: 'Cargo bancario', deposito: 'Depósito', retiro: 'Retiro',
};

/**
 * Valida un movimiento y arma su asiento. `salida` son las cajas y bancos de la
 * empresa; `cuentas` el catálogo (para la contrapartida). Lanza
 * `MovimientoBancarioError` con un mensaje que se le puede enseñar al usuario.
 */
export function armarMovimiento(
  m: MovimientoBancario,
  salida: ReadonlyMap<number, InfoCuenta>,
  cuentas: ReadonlyMap<number, InfoCuenta>,
  hoy: string,
): { fecha: string; concepto: string; lineas: LineaManualInput[] } {
  if (!fechaMovimientoValida(m.fecha, hoy)) {
    throw new MovimientoBancarioError(`La fecha no es válida (entre el año 2000 y ${DIAS_FUTURO_MAX} días a futuro).`);
  }
  if (!Number.isSafeInteger(m.montoCents) || m.montoCents <= 0) throw new MovimientoBancarioError('El monto debe ser mayor que cero.');
  if (m.montoCents > MOVIMIENTO_MAX_CENTS) throw new MovimientoBancarioError('El monto no puede pasar de RD$100,000,000.');

  const banco = (id: unknown, etiqueta: string): InfoCuenta => {
    const c = typeof id === 'number' ? salida.get(id) : undefined;
    if (!c) throw new MovimientoBancarioError(`${etiqueta} debe ser una caja o un banco activo de la empresa.`);
    return c;
  };
  const otra = (id: unknown, etiqueta: string): InfoCuenta => {
    const c = typeof id === 'number' ? cuentas.get(id) : undefined;
    if (!c) throw new MovimientoBancarioError(`${etiqueta} no existe en el catálogo de cuentas.`);
    if (!c.activa) throw new MovimientoBancarioError(`${etiqueta} (${c.codigo}) está desactivada.`);
    if (!c.imputable) throw new MovimientoBancarioError(`${etiqueta} (${c.codigo} ${c.nombre}) es un grupo: elige una cuenta de detalle que reciba apuntes.`);
    return c;
  };

  const monto = m.montoCents;
  const etiqueta = ETIQUETA[m.kind];

  if (m.kind === 'transferencia') {
    const origen = banco(m.cuentaOrigenId, 'La cuenta de origen');
    const destino = banco(m.cuentaDestinoId, 'La cuenta de destino');
    if (origen.id === destino.id) throw new MovimientoBancarioError('El origen y el destino son la misma cuenta.');
    const ref = textoLibre(m.referencia, 80);
    const concepto = `${etiqueta}: ${origen.nombre} → ${destino.nombre}${ref ? ` (${ref})` : ''}`.slice(0, 255);
    return {
      fecha: m.fecha, concepto,
      lineas: [
        { cuentaId: destino.id, debeCents: monto, haberCents: 0, descripcion: `Entra de ${origen.nombre}` },
        { cuentaId: origen.id, debeCents: 0, haberCents: monto, descripcion: `Sale hacia ${destino.nombre}` },
      ],
    };
  }

  const cuenta = banco(m.cuentaId, 'La cuenta');
  const texto = textoLibre(m.concepto, 120);

  if (m.kind === 'cargo') {
    const gasto = otra(m.cuentaGastoId, 'La cuenta de gasto');
    if (gasto.tipo !== 'gasto') {
      throw new MovimientoBancarioError(`«${gasto.codigo} ${gasto.nombre}» no es una cuenta de gasto: un cargo del banco es un gasto.`);
    }
    return {
      fecha: m.fecha, concepto: `${etiqueta}: ${texto ?? gasto.nombre} · ${cuenta.nombre}`.slice(0, 255),
      lineas: [
        { cuentaId: gasto.id, debeCents: monto, haberCents: 0, descripcion: texto ?? gasto.nombre },
        { cuentaId: cuenta.id, debeCents: 0, haberCents: monto, descripcion: texto ?? 'Cargo del banco' },
      ],
    };
  }

  const contra = otra(m.contrapartidaId, 'La otra cuenta');
  if (contra.id === cuenta.id) throw new MovimientoBancarioError('La cuenta y su contrapartida son la misma.');
  if (salida.has(contra.id)) {
    throw new MovimientoBancarioError('Para mover dinero entre dos cajas o bancos usa «Transferencia entre cuentas».');
  }
  const entra = m.kind === 'deposito';
  return {
    fecha: m.fecha, concepto: `${etiqueta}: ${texto ?? contra.nombre} · ${cuenta.nombre}`.slice(0, 255),
    lineas: [
      { cuentaId: entra ? cuenta.id : contra.id, debeCents: monto, haberCents: 0, descripcion: texto ?? (entra ? 'Depósito' : contra.nombre) },
      { cuentaId: entra ? contra.id : cuenta.id, debeCents: 0, haberCents: monto, descripcion: texto ?? (entra ? contra.nombre : 'Retiro') },
    ],
  };
}

/**
 * Una celda de CSV segura para Excel: un texto que empiece con = + - @ se abre
 * como fórmula, así que se le antepone una comilla. Comillas dobles duplicadas
 * y todo entrecomillado.
 */
export function celdaCsv(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return '';
  let t = String(v);
  if (typeof v === 'string' && /^[=+\-@\t\r]/.test(t)) t = `'${t}`;
  return /[",\n\r;]/.test(t) || t !== String(v) ? `"${t.replace(/"/g, '""')}"` : t;
}

// ─── Lo que toca la base ─────────────────────────────────────────────────────

const aNumero = (v: unknown) => Number(v ?? 0);

/** Las cajas y bancos de la empresa (lo que puede soltar dinero), para elegir. */
export async function cuentasBanco(teamId: number): Promise<InfoCuenta[]> {
  const { cuentas } = await cuentasDeSalida(teamId);
  if (cuentas.length === 0) return [];
  const ids = cuentas.map((c) => c.id);
  const filas = await db.execute(sql`
    SELECT id, codigo, nombre, tipo, imputable, activa FROM contabilidad_cuentas
    WHERE team_id = ${teamId} AND id IN (${sql.join(ids.map((i) => sql`${i}`), sql`, `)})
    ORDER BY codigo
  `);
  return filas as unknown as InfoCuenta[];
}

/** Todo el catálogo de la empresa, por id. */
async function catalogo(teamId: number): Promise<Map<number, InfoCuenta>> {
  const filas = await db.execute(sql`
    SELECT id, codigo, nombre, tipo, imputable, activa FROM contabilidad_cuentas WHERE team_id = ${teamId}
  `);
  return new Map((filas as unknown as InfoCuenta[]).map((c) => [c.id, c]));
}

export interface MovimientoLibro {
  lineaId: number;
  asientoId: number;
  fecha: string;
  concepto: string;
  descripcion: string | null;
  origenTipo: string;
  entraCents: number;
  saleCents: number;
  /** Saldo del libro después de este movimiento. */
  saldoCents: number;
  conciliado: boolean;
  referencia: string | null;
}

export interface LibroBanco {
  cuenta: InfoCuenta;
  desde: string | null;
  hasta: string | null;
  saldoInicialCents: number;
  movimientos: MovimientoLibro[];
  entradasCents: number;
  salidasCents: number;
  cantidadEntradas: number;
  cantidadSalidas: number;
  saldoFinalCents: number;
  /** El tramo tenía más movimientos de los que se devuelven. */
  truncado: boolean;
  /**
   * Conciliación al cierre del tramo: lo que el libro tiene como ya visto en el
   * extracto, lo que falta ver, y la cuenta que el usuario compara con el saldo
   * del extracto (diferencia = saldo del extracto − saldoConciliadoCents).
   */
  saldoConciliadoCents: number;
  pendientes: { cantidad: number; entradasCents: number; salidasCents: number };
}

/** Libro banco de una cuenta de caja o banco, con saldo corriente y estado de conciliación. */
export async function libroBanco(
  teamId: number,
  cuentaId: number,
  rango: { desde?: string | null; hasta?: string | null } = {},
): Promise<LibroBanco | null> {
  const cuentas = await cuentasBanco(teamId);
  const cuenta = cuentas.find((c) => c.id === cuentaId);
  if (!cuenta) return null;
  const desde = rango.desde ?? null;
  const hasta = rango.hasta ?? null;

  const [ini] = desde
    ? await db.execute(sql`
        SELECT COALESCE(sum(l.debe_cents - l.haber_cents), 0)::bigint AS saldo
        FROM contabilidad_asiento_lineas l JOIN contabilidad_asientos a ON a.id = l.asiento_id
        WHERE l.team_id = ${teamId} AND l.cuenta_id = ${cuentaId} AND a.fecha < ${desde}::date`) as unknown as { saldo: unknown }[]
    : [{ saldo: 0 }];
  const saldoInicialCents = aNumero(ini.saldo);

  const cond = [sql`l.team_id = ${teamId}`, sql`l.cuenta_id = ${cuentaId}`];
  if (desde) cond.push(sql`a.fecha >= ${desde}::date`);
  if (hasta) cond.push(sql`a.fecha <= ${hasta}::date`);
  const filas = await db.execute(sql`
    SELECT l.id AS "lineaId", a.id AS "asientoId", to_char(a.fecha, 'YYYY-MM-DD') AS fecha, a.concepto,
           l.descripcion, a.origen_tipo AS "origenTipo", l.debe_cents AS entra, l.haber_cents AS sale,
           (c.id IS NOT NULL) AS conciliado, c.referencia
    FROM contabilidad_asiento_lineas l
    JOIN contabilidad_asientos a ON a.id = l.asiento_id
    LEFT JOIN contabilidad_conciliaciones c ON c.linea_id = l.id
    WHERE ${sql.join(cond, sql` AND `)}
    ORDER BY a.fecha ASC, a.id ASC, l.orden ASC
    LIMIT ${LIBRO_MAX_MOVIMIENTOS + 1}
  `) as unknown as {
    lineaId: number; asientoId: number; fecha: string; concepto: string; descripcion: string | null; origenTipo: string;
    entra: unknown; sale: unknown; conciliado: boolean; referencia: string | null;
  }[];

  const truncado = filas.length > LIBRO_MAX_MOVIMIENTOS;
  let saldo = saldoInicialCents;
  let entradas = 0, salidas = 0, nEntradas = 0, nSalidas = 0;
  const pend = { cantidad: 0, entradasCents: 0, salidasCents: 0 };
  const movimientos: MovimientoLibro[] = filas.slice(0, LIBRO_MAX_MOVIMIENTOS).map((f) => {
    const entra = aNumero(f.entra), sale = aNumero(f.sale);
    saldo += entra - sale;
    if (entra > 0) { entradas += entra; nEntradas++; }
    if (sale > 0) { salidas += sale; nSalidas++; }
    if (!f.conciliado) { pend.cantidad++; pend.entradasCents += entra; pend.salidasCents += sale; }
    return {
      lineaId: f.lineaId, asientoId: f.asientoId, fecha: f.fecha, concepto: f.concepto, descripcion: f.descripcion,
      origenTipo: f.origenTipo, entraCents: entra, saleCents: sale, saldoCents: saldo,
      conciliado: f.conciliado, referencia: f.referencia,
    };
  });

  // Lo conciliado cuenta de todo el tiempo hasta el cierre del tramo, no solo del tramo:
  // el extracto del banco arrastra todo lo anterior.
  const [conc] = await db.execute(sql`
    SELECT COALESCE(sum(l.debe_cents - l.haber_cents), 0)::bigint AS saldo
    FROM contabilidad_conciliaciones c
    JOIN contabilidad_asiento_lineas l ON l.id = c.linea_id
    JOIN contabilidad_asientos a ON a.id = l.asiento_id
    WHERE c.team_id = ${teamId} AND c.cuenta_id = ${cuentaId}
      ${hasta ? sql`AND a.fecha <= ${hasta}::date` : sql``}
  `) as unknown as { saldo: unknown }[];

  return {
    cuenta, desde, hasta, saldoInicialCents, movimientos,
    entradasCents: entradas, salidasCents: salidas, cantidadEntradas: nEntradas, cantidadSalidas: nSalidas,
    saldoFinalCents: saldo, truncado, saldoConciliadoCents: aNumero(conc.saldo), pendientes: pend,
  };
}

/** Registra un movimiento (transferencia, cargo, depósito o retiro) como asiento manual. */
export async function registrarMovimiento(
  teamId: number,
  userId: number,
  m: MovimientoBancario,
  hoy: string,
): Promise<{ asientoId: number }> {
  const [bancos, todas] = await Promise.all([cuentasBanco(teamId), catalogo(teamId)]);
  const salida = new Map(bancos.filter((b) => b.activa && b.imputable).map((b) => [b.id, b]));
  const armado = armarMovimiento(m, salida, todas, hoy);

  // Un doble clic o dos pestañas no deben registrar dos veces la misma transferencia
  // (un asiento manual no es idempotente: dos iguales son dos asientos). Un candado por
  // empresa y movimiento hace que el segundo espere al primero y vea que ya existe.
  const huella = `${teamId}|${armado.fecha}|${armado.concepto}|${m.montoCents}`;
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${huella}))`);
    const [repetido] = await tx.execute(sql`
      SELECT id FROM contabilidad_asientos
      WHERE team_id = ${teamId} AND origen_tipo = 'manual' AND fecha = ${armado.fecha}::date
        AND concepto = ${armado.concepto} AND total_cents = ${m.montoCents}
        AND created_at > now() - interval '20 seconds'
      LIMIT 1`) as unknown as { id: number }[];
    if (repetido) {
      throw new MovimientoBancarioError('Ya registraste este mismo movimiento hace unos segundos. ¿Fue un doble clic?', 409);
    }
    try {
      return await generarAsientoManual(teamId, armado, userId);
    } catch (e) {
      if (e instanceof AsientoManualError) throw new MovimientoBancarioError(e.message);
      throw e;
    }
  });
}

/**
 * Marca (o desmarca) apuntes de una cuenta como vistos en el estado de cuenta del
 * banco. Solo apuntes de ESA cuenta y de esta empresa: un id ajeno se ignora y se
 * cuenta aparte, no se concilia. Devuelve cuántos cambiaron.
 */
export async function conciliar(
  teamId: number,
  userId: number,
  cuentaId: number,
  lineaIds: number[],
  conciliada: boolean,
  referencia: string | null,
): Promise<{ cambiados: number; ignorados: number }> {
  if (lineaIds.length === 0) return { cambiados: 0, ignorados: 0 };
  const propias = await db.execute(sql`
    SELECT id FROM contabilidad_asiento_lineas
    WHERE team_id = ${teamId} AND cuenta_id = ${cuentaId}
      AND id IN (${sql.join(lineaIds.map((i) => sql`${i}`), sql`, `)})
  `) as unknown as { id: number }[];
  const validos = propias.map((p) => p.id);
  const ignorados = lineaIds.length - validos.length;
  if (validos.length === 0) return { cambiados: 0, ignorados };

  const lista = sql.join(validos.map((i) => sql`${i}`), sql`, `);
  if (!conciliada) {
    const r = await db.execute(sql`DELETE FROM contabilidad_conciliaciones WHERE team_id = ${teamId} AND linea_id IN (${lista}) RETURNING id`) as unknown as unknown[];
    return { cambiados: r.length, ignorados };
  }
  const r = await db.execute(sql`
    INSERT INTO contabilidad_conciliaciones (team_id, linea_id, cuenta_id, referencia, conciliado_por)
    SELECT ${teamId}, id, ${cuentaId}, ${referencia}, ${userId} FROM contabilidad_asiento_lineas WHERE id IN (${lista})
    ON CONFLICT (linea_id) DO NOTHING RETURNING id
  `) as unknown as unknown[];
  return { cambiados: r.length, ignorados };
}

export interface ResumenEfectivo {
  desde: string | null;
  hasta: string | null;
  cuentas: { cuentaId: number; codigo: string; nombre: string; entraCents: number; saleCents: number }[];
  /** Lo que salió en efectivo, por tipo de origen (gasto, pago de nómina, compra…). */
  salidasPorOrigen: { origenTipo: string; saleCents: number; cantidad: number }[];
  entradasCents: number;
  salidasCents: number;
}

/**
 * Cuánto se movió en efectivo: lo que entró y salió de las cajas (cuentas 1101)
 * en un rango, por caja y por tipo de movimiento. Responde «¿cuánto he pagado en
 * efectivo en agosto?».
 */
export async function resumenEfectivo(
  teamId: number,
  rango: { desde?: string | null; hasta?: string | null } = {},
): Promise<ResumenEfectivo> {
  const desde = rango.desde ?? null;
  const hasta = rango.hasta ?? null;
  const cond = [sql`l.team_id = ${teamId}`, sql`c.codigo LIKE '1101%'`, sql`c.imputable`];
  if (desde) cond.push(sql`a.fecha >= ${desde}::date`);
  if (hasta) cond.push(sql`a.fecha <= ${hasta}::date`);
  const donde = sql.join(cond, sql` AND `);

  const [porCuenta, porOrigen] = await Promise.all([
    db.execute(sql`
      SELECT c.id AS "cuentaId", c.codigo, c.nombre, COALESCE(sum(l.debe_cents), 0)::bigint AS entra, COALESCE(sum(l.haber_cents), 0)::bigint AS sale
      FROM contabilidad_asiento_lineas l
      JOIN contabilidad_asientos a ON a.id = l.asiento_id
      JOIN contabilidad_cuentas c ON c.id = l.cuenta_id
      WHERE ${donde} GROUP BY c.id, c.codigo, c.nombre ORDER BY c.codigo`),
    db.execute(sql`
      SELECT a.origen_tipo AS "origenTipo", COALESCE(sum(l.haber_cents), 0)::bigint AS sale, count(*)::int AS cantidad
      FROM contabilidad_asiento_lineas l
      JOIN contabilidad_asientos a ON a.id = l.asiento_id
      JOIN contabilidad_cuentas c ON c.id = l.cuenta_id
      WHERE ${donde} AND l.haber_cents > 0 GROUP BY a.origen_tipo ORDER BY sum(l.haber_cents) DESC`),
  ]) as unknown as [
    { cuentaId: number; codigo: string; nombre: string; entra: unknown; sale: unknown }[],
    { origenTipo: string; sale: unknown; cantidad: number }[],
  ];

  const cuentas = porCuenta.map((f) => ({ cuentaId: f.cuentaId, codigo: f.codigo, nombre: f.nombre, entraCents: aNumero(f.entra), saleCents: aNumero(f.sale) }));
  return {
    desde, hasta, cuentas,
    salidasPorOrigen: porOrigen.map((f) => ({ origenTipo: f.origenTipo, saleCents: aNumero(f.sale), cantidad: f.cantidad })),
    entradasCents: cuentas.reduce((s, c) => s + c.entraCents, 0),
    salidasCents: cuentas.reduce((s, c) => s + c.saleCents, 0),
  };
}
