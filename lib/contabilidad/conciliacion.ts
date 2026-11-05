/**
 * Conciliación bancaria contra el estado de cuenta: importar el extracto,
 * emparejarlo con el libro y atender lo que no empareja.
 *
 * Se apoya en las marcas de `bancos.ts` (`contabilidad_conciliaciones`, 0220): un
 * apunte emparejado con una línea del extracto queda conciliado en el libro
 * banco, igual que si alguien lo hubiera marcado a mano. Lo puro (leer el
 * archivo, emparejar) está en `extracto.ts`.
 *
 * Reglas:
 *  · Emparejar NO crea ni cambia asientos: solo marca. Se puede deshacer.
 *  · Lo único que asienta es registrar un depósito sin identificar (a 2115) y
 *    asignarlo después (de 2115 al saldo a favor del cliente, 2104). Cada paso
 *    toma un candado de estado antes de asentar, así que un doble clic no
 *    asienta dos veces.
 *  · «Registrar» y «Asignar» un depósito están APAGADOS por defecto
 *    (`CONCILIACION_DEPOSITOS_ACTIVA=1` los enciende). El motivo: el saldo a
 *    favor que Cobros deja aplicar sale de las notas de crédito, no de 2104; si
 *    el depósito se asienta aquí y luego se cobra normal, el banco cuenta el
 *    mismo dinero dos veces. Con la bandera apagada la bandeja solo informa.
 *    Conectar el depósito con Cobros (asiento 2115 / CxC sin pasar por banco)
 *    queda para después.
 *  · Todo degrada con `tablaExiste`: sin la migración 0224 las pantallas
 *    simplemente no tienen extracto que mostrar.
 */

import { sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { cuentasBanco, tablaExiste, textoLibre } from './bancos';
import { AsientoManualError } from './asientos';
import { insertarAsientoManualTx } from './asiento-tx';
import { asegurarCuentaBase, CODIGO } from './catalogo-base';
import { getConfig } from './config';
import {
  emparejar, huellasDeFilas, DIAS_SUGERENCIA,
  type ExtractoLeido, type LineaExtractoPorEmparejar, type LineaLibroPorEmparejar,
} from './extracto';

/** ¿Violó un índice único (código 23505 de Postgres)? */
function esViolacionUnica(e: unknown): boolean {
  return typeof e === 'object' && e !== null && (e as { code?: string }).code === '23505';
}

export class ConciliacionError extends Error {
  constructor(message: string, readonly status = 422) { super(message); this.name = 'ConciliacionError'; }
}

/** ¿Se pueden registrar y asignar depósitos sin identificar? Apagado salvo que se encienda. */
export function depositosSinIdentificarActivo(): boolean {
  return process.env.CONCILIACION_DEPOSITOS_ACTIVA === '1';
}

function exigirDepositosActivos(): void {
  if (!depositosSinIdentificarActivo()) {
    throw new ConciliacionError(
      'Registrar y asignar depósitos sin identificar está apagado: asentarlos aquí y luego cobrarlos en Cobros contaría el banco dos veces. Por ahora la lista es solo informativa.', 403);
  }
}

const TABLAS = ['contabilidad_extractos', 'contabilidad_extracto_lineas', 'contabilidad_conciliaciones'] as const;
const NO_MIGRADO = 'Importar el estado de cuenta necesita una actualización de la base que aún no se aplica.';

async function exigirTablas(): Promise<void> {
  for (const t of TABLAS) if (!await tablaExiste(t)) throw new ConciliacionError(NO_MIGRADO, 503);
}

const n = (v: unknown) => Number(v ?? 0);

/** La cuenta es una caja o banco imputable de la empresa. */
async function bancoDelTeam(teamId: number, cuentaId: number) {
  const banco = (await cuentasBanco(teamId)).find((c) => c.id === cuentaId && c.imputable && c.activa);
  if (!banco) throw new ConciliacionError('Esa cuenta no es una caja o un banco activo de la empresa.', 400);
  return banco;
}

// ── Importar ────────────────────────────────────────────────────────────────

export interface ResultadoImportacion {
  extractoId: number;
  total: number;
  nuevas: number;
  /** Líneas que ya estaban de un archivo anterior (los tramos se pueden traslapar). */
  yaImportadas: number;
}

const LOTE = 400;

export async function importarExtracto(input: {
  teamId: number; userId: number; cuentaId: number; archivoNombre: string | null; lectura: ExtractoLeido;
}): Promise<ResultadoImportacion> {
  await exigirTablas();
  await bancoDelTeam(input.teamId, input.cuentaId);
  const { filas } = input.lectura;
  if (filas.length === 0) throw new ConciliacionError('El archivo no trae movimientos que importar.', 400);

  const huellas = huellasDeFilas(input.cuentaId, filas);
  const fechas = filas.map((f) => f.fecha).sort();

  return db.transaction(async (tx) => {
    const [cab] = await tx.execute(sql`
      INSERT INTO contabilidad_extractos (team_id, cuenta_id, archivo_nombre, desde, hasta, filas, importado_por)
      VALUES (${input.teamId}, ${input.cuentaId}, ${input.archivoNombre?.slice(0, 255) ?? null},
              ${fechas[0]}::date, ${fechas[fechas.length - 1]}::date, ${filas.length}, ${input.userId})
      RETURNING id`) as unknown as { id: number }[];

    let nuevas = 0;
    for (let i = 0; i < filas.length; i += LOTE) {
      const tanda = filas.slice(i, i + LOTE);
      const valores = tanda.map((f, j) => sql`(
        ${input.teamId}, ${cab.id}, ${input.cuentaId}, ${f.fecha}::date, ${f.descripcion}, ${f.referencia},
        ${f.montoCents}, ${f.saldoCents}, ${huellas[i + j]})`);
      const r = await tx.execute(sql`
        INSERT INTO contabilidad_extracto_lineas
          (team_id, extracto_id, cuenta_id, fecha, descripcion, referencia, monto_cents, saldo_cents, huella)
        VALUES ${sql.join(valores, sql`, `)}
        ON CONFLICT (team_id, huella) DO NOTHING
        RETURNING id`) as unknown as unknown[];
      nuevas += r.length;
    }
    await tx.execute(sql`UPDATE contabilidad_extractos SET nuevas = ${nuevas} WHERE id = ${cab.id}`);
    return { extractoId: cab.id, total: filas.length, nuevas, yaImportadas: filas.length - nuevas };
  });
}

// ── Emparejar ───────────────────────────────────────────────────────────────

export interface ResultadoEmparejado {
  emparejadas: number;
  porReferencia: number;
  /** Con más de un candidato igual de bueno: se resuelven a mano. */
  ambiguas: number;
  /** Mismo monto pero entre 7 y 45 días: se ofrecen para revisar, no se unen solas. */
  sugeridas: number;
  sinPareja: number;
}

/** Los apuntes del libro de una cuenta de banco que todavía no tienen su línea del extracto, en un rango (con margen de sugerencia). */
async function apuntesLibres(teamId: number, cuentaId: number, desde: string, hasta: string): Promise<LineaLibroPorEmparejar[]> {
  const filas = await db.execute(sql`
    SELECT l.id, to_char(a.fecha, 'YYYY-MM-DD') AS fecha, (l.debe_cents - l.haber_cents) AS monto,
           concat_ws(' ', a.concepto, l.descripcion, pp.referencia, pr.referencia) AS texto
    FROM contabilidad_asiento_lineas l
    JOIN contabilidad_asientos a ON a.id = l.asiento_id
    LEFT JOIN pagos_proveedores pp ON a.origen_tipo = 'pago_proveedor' AND pp.id = a.origen_id AND pp.team_id = ${teamId}
    LEFT JOIN pagos_recibidos pr ON a.origen_tipo = 'pago' AND pr.id = a.origen_id AND pr.team_id = ${teamId}
    WHERE l.team_id = ${teamId} AND l.cuenta_id = ${cuentaId}
      -- Las marcas hechas a mano (0220) SÍ se ofrecen: lo que no se ofrece es un apunte que ya tiene su línea del extracto.
      AND NOT EXISTS (SELECT 1 FROM contabilidad_extracto_lineas e WHERE e.linea_id = l.id AND e.team_id = ${teamId})
      AND a.fecha >= ${desde}::date - (${DIAS_SUGERENCIA}::int * interval '1 day') AND a.fecha <= ${hasta}::date + (${DIAS_SUGERENCIA}::int * interval '1 day')
  `) as unknown as { id: number; fecha: string; monto: unknown; texto: string | null }[];
  return filas.map((f) => ({ id: f.id, fecha: f.fecha, montoCents: n(f.monto), texto: f.texto ?? '' }));
}

/**
 * Empareja las líneas pendientes del extracto de una cuenta con los apuntes del
 * libro. Marca ambos lados (la línea del extracto y la conciliación del libro) y
 * devuelve cuántas quedaron ambiguas o sin pareja. Se puede correr las veces que
 * haga falta: solo toca lo pendiente.
 */
export async function emparejarExtracto(teamId: number, userId: number, cuentaId: number): Promise<ResultadoEmparejado> {
  await exigirTablas();
  await bancoDelTeam(teamId, cuentaId);

  const pendientes = await db.execute(sql`
    SELECT id, to_char(fecha, 'YYYY-MM-DD') AS fecha, monto_cents AS monto, referencia, descripcion
    FROM contabilidad_extracto_lineas
    WHERE team_id = ${teamId} AND cuenta_id = ${cuentaId} AND estado = 'pendiente'
    ORDER BY fecha, id`) as unknown as { id: number; fecha: string; monto: unknown; referencia: string | null; descripcion: string | null }[];
  if (pendientes.length === 0) return { emparejadas: 0, porReferencia: 0, ambiguas: 0, sugeridas: 0, sinPareja: 0 };

  const extracto: LineaExtractoPorEmparejar[] = pendientes.map((p) => ({
    id: p.id, fecha: p.fecha, montoCents: n(p.monto), referencia: p.referencia, descripcion: p.descripcion,
  }));
  const fechas = extracto.map((e) => e.fecha).sort();
  const libro = await apuntesLibres(teamId, cuentaId, fechas[0], fechas[fechas.length - 1]);
  const r = emparejar(extracto, libro);

  let emparejadas = 0; let porReferencia = 0;
  for (const par of r.pares) {
    const ok = await db.transaction(async (tx) => {
      // Si el apunte ya tenía una marca hecha a mano (0220) se respeta y se enlaza; si no, se crea.
      const creada = await tx.execute(sql`
        INSERT INTO contabilidad_conciliaciones (team_id, linea_id, cuenta_id, referencia, conciliado_por)
        SELECT ${teamId}, l.id, ${cuentaId}, e.referencia, ${userId}
        FROM contabilidad_asiento_lineas l, contabilidad_extracto_lineas e
        WHERE l.id = ${par.libroId} AND l.team_id = ${teamId} AND l.cuenta_id = ${cuentaId}
          AND e.id = ${par.extractoId} AND e.team_id = ${teamId} AND e.estado = 'pendiente'
        ON CONFLICT (linea_id) DO NOTHING RETURNING id`) as unknown as unknown[];
      // El apunte se usa una sola vez: si otra línea del extracto lo tomó mientras tanto, esta pareja se descarta.
      const act = await tx.execute(sql`
        UPDATE contabilidad_extracto_lineas
        SET estado = 'emparejada', linea_id = ${par.libroId}, metodo_emparejado = 'automatico', marca_previa = ${creada.length === 0},
            resuelta_por = ${userId}, resuelta_at = NOW()
        WHERE id = ${par.extractoId} AND team_id = ${teamId} AND estado = 'pendiente'
          AND NOT EXISTS (SELECT 1 FROM contabilidad_extracto_lineas x WHERE x.team_id = ${teamId} AND x.linea_id = ${par.libroId})
        RETURNING id`) as unknown as unknown[];
      if (act.length === 0) throw new Error('rollback-par');
      return true;
    }).catch((e) => {
      // Otro emparejado se llevó el apunte a la vez: el índice único lo impide y esta pareja se descarta.
      if (esViolacionUnica(e) || (e instanceof Error && e.message === 'rollback-par')) return false;
      throw e;
    });
    if (ok) { emparejadas++; if (par.motivo === 'referencia') porReferencia++; }
  }

  const ambiguas = r.ambiguas.length;
  const sugeridas = r.sugeridas.length;
  return { emparejadas, porReferencia, ambiguas, sugeridas, sinPareja: pendientes.length - emparejadas - ambiguas - sugeridas };
}

/** Empareja a mano una línea del extracto con un apunte del libro del mismo monto. */
export async function emparejarManual(teamId: number, userId: number, extractoLineaId: number, libroLineaId: number): Promise<void> {
  await exigirTablas();
  const [e] = await db.execute(sql`
    SELECT cuenta_id AS "cuentaId", monto_cents AS monto, estado, referencia
    FROM contabilidad_extracto_lineas WHERE id = ${extractoLineaId} AND team_id = ${teamId}`) as unknown as
    { cuentaId: number; monto: unknown; estado: string; referencia: string | null }[];
  if (!e) throw new ConciliacionError('La línea del estado de cuenta no existe.', 404);
  if (e.estado !== 'pendiente') throw new ConciliacionError('Esa línea ya está resuelta. Deshaz su estado antes de emparejarla de nuevo.', 409);

  const [l] = await db.execute(sql`
    SELECT (debe_cents - haber_cents) AS monto FROM contabilidad_asiento_lineas
    WHERE id = ${libroLineaId} AND team_id = ${teamId} AND cuenta_id = ${e.cuentaId}`) as unknown as { monto: unknown }[];
  if (!l) throw new ConciliacionError('Ese apunte no es de esta cuenta.', 404);
  if (n(l.monto) !== n(e.monto)) throw new ConciliacionError('El monto del apunte no es el mismo que el de la línea del banco.', 422);

  await db.transaction(async (tx) => {
    // Una marca hecha a mano antes se respeta y se enlaza; solo falla si OTRA línea del extracto ya tomó el apunte.
    const creada = await tx.execute(sql`
      INSERT INTO contabilidad_conciliaciones (team_id, linea_id, cuenta_id, referencia, conciliado_por)
      VALUES (${teamId}, ${libroLineaId}, ${e.cuentaId}, ${e.referencia}, ${userId})
      ON CONFLICT (linea_id) DO NOTHING RETURNING id`) as unknown as unknown[];
    const act = await tx.execute(sql`
      UPDATE contabilidad_extracto_lineas
      SET estado = 'emparejada', linea_id = ${libroLineaId}, metodo_emparejado = 'manual', marca_previa = ${creada.length === 0}, resuelta_por = ${userId}, resuelta_at = NOW()
      WHERE id = ${extractoLineaId} AND team_id = ${teamId} AND estado = 'pendiente'
        AND NOT EXISTS (SELECT 1 FROM contabilidad_extracto_lineas x WHERE x.team_id = ${teamId} AND x.linea_id = ${libroLineaId})
      RETURNING id`) as unknown as unknown[];
    if (act.length === 0) throw new ConciliacionError('Esa línea cambió, o ese apunte ya está emparejado con otra línea. Actualiza la pantalla.', 409);
  }).catch((err) => {
    if (esViolacionUnica(err)) throw new ConciliacionError('Ese apunte ya está emparejado con otra línea del banco. Actualiza la pantalla.', 409);
    throw err;
  });
}

/** Deshace un emparejamiento (automático o manual): la línea vuelve a pendiente y el apunte a sin conciliar. */
export async function desemparejar(teamId: number, extractoLineaId: number): Promise<void> {
  await exigirTablas();
  await db.transaction(async (tx) => {
    const [e] = await tx.execute(sql`
      SELECT linea_id AS "lineaId", marca_previa AS "marcaPrevia" FROM contabilidad_extracto_lineas
      WHERE id = ${extractoLineaId} AND team_id = ${teamId} AND estado = 'emparejada' FOR UPDATE`) as unknown as { lineaId: number | null; marcaPrevia: boolean }[];
    if (!e) throw new ConciliacionError('La línea no está emparejada. Actualiza la pantalla.', 409);
    // Si el apunte ya tenía una marca hecha a mano antes de emparejarse, se queda con ella: se devuelve como estaba.
    if (e.lineaId && !e.marcaPrevia) {
      await tx.execute(sql`DELETE FROM contabilidad_conciliaciones WHERE team_id = ${teamId} AND linea_id = ${e.lineaId}`);
    }
    await tx.execute(sql`
      UPDATE contabilidad_extracto_lineas
      SET estado = 'pendiente', linea_id = NULL, metodo_emparejado = NULL, marca_previa = false, resuelta_por = NULL, resuelta_at = NULL
      WHERE id = ${extractoLineaId} AND team_id = ${teamId}`);
  });
}

// ── Bandeja ─────────────────────────────────────────────────────────────────

export type EstadoLineaExtracto = 'pendiente' | 'emparejada' | 'registrada' | 'asignada' | 'ignorada';

export interface LineaExtractoVista {
  id: number;
  fecha: string;
  descripcion: string | null;
  referencia: string | null;
  montoCents: number;
  estado: string;
  lineaId: number | null;
  metodoEmparejado: string | null;
  clienteId: number | null;
  clienteNombre: string | null;
  cargoReferencia: string | null;
  nota: string | null;
}

export interface Bandeja {
  /** Todo lo que no está emparejado ni ignorado, para trabajar. */
  pendientes: LineaExtractoVista[];
  /** Depósitos (entró dinero) sin pareja en el libro: los «depósitos sin identificar». */
  depositosSinIdentificar: LineaExtractoVista[];
  /** Retiros y cargos del banco sin pareja en el libro. */
  retirosSinRegistrar: LineaExtractoVista[];
  resumen: {
    emparejadas: number; pendientes: number; registradas: number; asignadas: number; ignoradas: number;
    depositosPendientesCents: number; retirosPendientesCents: number;
  };
  /** Falta correr la migración: la pantalla lo explica en vez de fallar. */
  disponible: boolean;
  /** Registrar y asignar depósitos está encendido (por defecto NO: la lista es solo informativa). */
  depositosActivo: boolean;
}

const VACIA: Bandeja = {
  pendientes: [], depositosSinIdentificar: [], retirosSinRegistrar: [], disponible: false, depositosActivo: false,
  resumen: { emparejadas: 0, pendientes: 0, registradas: 0, asignadas: 0, ignoradas: 0, depositosPendientesCents: 0, retirosPendientesCents: 0 },
};

const TOPE_BANDEJA = 500;

function aVista(f: Record<string, unknown>): LineaExtractoVista {
  return {
    id: n(f.id), fecha: String(f.fecha), descripcion: (f.descripcion as string) ?? null, referencia: (f.referencia as string) ?? null,
    montoCents: n(f.monto), estado: String(f.estado), lineaId: f.lineaId == null ? null : n(f.lineaId),
    metodoEmparejado: (f.metodo as string) ?? null, clienteId: f.clienteId == null ? null : n(f.clienteId),
    clienteNombre: (f.clienteNombre as string) ?? null, cargoReferencia: (f.cargo as string) ?? null, nota: (f.nota as string) ?? null,
  };
}

export async function bandejaExtracto(teamId: number, cuentaId: number): Promise<Bandeja> {
  for (const t of TABLAS) if (!await tablaExiste(t)) return VACIA;
  await bancoDelTeam(teamId, cuentaId);

  const [cuentas] = await db.execute(sql`
    SELECT count(*) FILTER (WHERE estado = 'emparejada')::int AS emparejadas,
           count(*) FILTER (WHERE estado = 'pendiente')::int AS pendientes,
           count(*) FILTER (WHERE estado = 'registrada')::int AS registradas,
           count(*) FILTER (WHERE estado = 'asignada')::int AS asignadas,
           count(*) FILTER (WHERE estado = 'ignorada')::int AS ignoradas,
           COALESCE(sum(monto_cents) FILTER (WHERE estado = 'pendiente' AND monto_cents > 0), 0)::bigint AS dep,
           COALESCE(-sum(monto_cents) FILTER (WHERE estado = 'pendiente' AND monto_cents < 0), 0)::bigint AS ret
    FROM contabilidad_extracto_lineas WHERE team_id = ${teamId} AND cuenta_id = ${cuentaId}`) as unknown as Record<string, unknown>[];

  const filas = await db.execute(sql`
    SELECT e.id, to_char(e.fecha, 'YYYY-MM-DD') AS fecha, e.descripcion, e.referencia, e.monto_cents AS monto, e.estado,
           e.linea_id AS "lineaId", e.metodo_emparejado AS metodo, e.cliente_id AS "clienteId",
           c.razon_social AS "clienteNombre", e.cargo_referencia AS cargo, e.nota
    FROM contabilidad_extracto_lineas e
    LEFT JOIN clients c ON c.id = e.cliente_id
    WHERE e.team_id = ${teamId} AND e.cuenta_id = ${cuentaId} AND e.estado IN ('pendiente', 'registrada', 'asignada')
    ORDER BY e.fecha DESC, e.id DESC
    LIMIT ${TOPE_BANDEJA}`) as unknown as Record<string, unknown>[];
  const vistas = filas.map(aVista);

  return {
    disponible: true,
    depositosActivo: depositosSinIdentificarActivo(),
    pendientes: vistas.filter((v) => v.estado === 'pendiente'),
    // Un depósito sin identificar lo es desde que llega hasta que se asigna.
    depositosSinIdentificar: vistas.filter((v) => v.montoCents > 0 && (v.estado === 'pendiente' || v.estado === 'registrada')),
    retirosSinRegistrar: vistas.filter((v) => v.montoCents < 0 && v.estado === 'pendiente'),
    resumen: {
      emparejadas: n(cuentas.emparejadas), pendientes: n(cuentas.pendientes), registradas: n(cuentas.registradas),
      asignadas: n(cuentas.asignadas), ignoradas: n(cuentas.ignoradas),
      depositosPendientesCents: n(cuentas.dep), retirosPendientesCents: n(cuentas.ret),
    },
  };
}

/** Los apuntes sin conciliar del libro con el mismo monto que una línea del extracto: candidatos para emparejar a mano. */
export async function candidatosManuales(teamId: number, extractoLineaId: number): Promise<{ lineaId: number; fecha: string; concepto: string; montoCents: number }[]> {
  await exigirTablas();
  const [e] = await db.execute(sql`
    SELECT cuenta_id AS "cuentaId", monto_cents AS monto FROM contabilidad_extracto_lineas
    WHERE id = ${extractoLineaId} AND team_id = ${teamId}`) as unknown as { cuentaId: number; monto: unknown }[];
  if (!e) throw new ConciliacionError('La línea del estado de cuenta no existe.', 404);
  const filas = await db.execute(sql`
    SELECT l.id AS "lineaId", to_char(a.fecha, 'YYYY-MM-DD') AS fecha, a.concepto, (l.debe_cents - l.haber_cents) AS monto
    FROM contabilidad_asiento_lineas l
    JOIN contabilidad_asientos a ON a.id = l.asiento_id
    WHERE l.team_id = ${teamId} AND l.cuenta_id = ${e.cuentaId}
      AND NOT EXISTS (SELECT 1 FROM contabilidad_extracto_lineas x WHERE x.team_id = ${teamId} AND x.linea_id = l.id)
      AND (l.debe_cents - l.haber_cents) = ${n(e.monto)}
    ORDER BY a.fecha DESC, l.id DESC LIMIT 30`) as unknown as { lineaId: number; fecha: string; concepto: string; monto: unknown }[];
  return filas.map((f) => ({ lineaId: f.lineaId, fecha: f.fecha, concepto: f.concepto, montoCents: n(f.monto) }));
}

/** Deja una línea fuera de la conciliación (o la devuelve). Solo si no está emparejada ni asentada. */
export async function ignorarLinea(teamId: number, userId: number, extractoLineaId: number, ignorar: boolean): Promise<void> {
  await exigirTablas();
  const filas = await db.execute(sql`
    UPDATE contabilidad_extracto_lineas
    SET estado = ${ignorar ? 'ignorada' : 'pendiente'}, resuelta_por = ${ignorar ? userId : null}, resuelta_at = ${ignorar ? sql`NOW()` : sql`NULL`}
    WHERE id = ${extractoLineaId} AND team_id = ${teamId} AND estado = ${ignorar ? 'pendiente' : 'ignorada'}
    RETURNING id`) as unknown as unknown[];
  if (filas.length === 0) throw new ConciliacionError('La línea no está en un estado que permita esto. Actualiza la pantalla.', 409);
}

// ── Depósitos sin identificar ───────────────────────────────────────────────

/** Una cuenta del catálogo, imputable y activa, por código (creándola si es de la base y falta). */
async function cuentaImputable(teamId: number, codigo: string, userId: number): Promise<number> {
  const id = await asegurarCuentaBase(teamId, codigo, userId);
  if (!id) throw new ConciliacionError(`Falta la cuenta ${codigo} en el catálogo.`, 422);
  const [c] = await db.execute(sql`SELECT imputable, activa FROM contabilidad_cuentas WHERE id = ${id} AND team_id = ${teamId}`) as unknown as { imputable: boolean; activa: boolean }[];
  if (!c?.imputable || !c.activa) throw new ConciliacionError(`La cuenta ${codigo} debe estar activa y aceptar movimientos.`, 422);
  return id;
}

const fechaDe = (f: unknown) => String(f).slice(0, 10);

/** Minutos que un candado de «registrando» o «asignando» vale antes de poder reintentarse. */


/** Una cuenta que la propia configuración eligió: sigue tenido que ser de la empresa, imputable y activa. */
async function cuentaConfigurada(teamId: number, id: number): Promise<number> {
  const [c] = await db.execute(sql`SELECT imputable, activa FROM contabilidad_cuentas WHERE id = ${id} AND team_id = ${teamId}`) as unknown as { imputable: boolean; activa: boolean }[];
  if (!c?.imputable || !c.activa) throw new ConciliacionError('La cuenta de saldos a favor configurada debe estar activa y aceptar movimientos.', 422);
  return id;
}

/**
 * Registra un depósito del banco que no se sabe de quién es: débito al banco,
 * crédito a «Depósitos por identificar» (2115). El asiento, la marca de
 * conciliación y el estado de la línea salen en UNA transacción, con la línea
 * bloqueada: un doble clic o un fallo a medias no deja un asiento sin su marca.
 *
 * Solo con la bandera encendida (ver `depositosSinIdentificarActivo`).
 */
export async function registrarDepositoSinIdentificar(teamId: number, userId: number, extractoLineaId: number): Promise<{ asientoId: number }> {
  exigirDepositosActivos();
  await exigirTablas();
  const porIdentificar = await cuentaImputable(teamId, CODIGO.depositosPorIdentificar, userId);

  return db.transaction(async (tx) => {
    const [e] = await tx.execute(sql`
      SELECT cuenta_id AS "cuentaId", to_char(fecha, 'YYYY-MM-DD') AS fecha, monto_cents AS monto, referencia, descripcion
      FROM contabilidad_extracto_lineas
      WHERE id = ${extractoLineaId} AND team_id = ${teamId} AND monto_cents > 0 AND estado = 'pendiente' FOR UPDATE`) as unknown as
      { cuentaId: number; fecha: string; monto: unknown; referencia: string | null; descripcion: string | null }[];
    if (!e) throw new ConciliacionError('Solo se registra un depósito (entró dinero) que siga pendiente. Actualiza la pantalla.', 409);

    const detalle = textoLibre(e.referencia ? `ref. ${e.referencia}` : e.descripcion, 100);
    let asientoId: number;
    try {
      ({ asientoId } = await insertarAsientoManualTx(tx, teamId, {
        fecha: e.fecha,
        concepto: `Depósito por identificar${detalle ? ` · ${detalle}` : ''}`.slice(0, 255),
        lineas: [
          { cuentaId: e.cuentaId, debeCents: n(e.monto), haberCents: 0, descripcion: 'Depósito según el estado de cuenta' },
          { cuentaId: porIdentificar, debeCents: 0, haberCents: n(e.monto), descripcion: 'Pendiente de identificar quién lo hizo' },
        ],
      }, userId));
    } catch (err) {
      if (err instanceof AsientoManualError) throw new ConciliacionError(err.message);
      throw err;
    }

    // El apunte del banco de ese asiento queda conciliado con la línea del extracto.
    const [apunte] = await tx.execute(sql`
      SELECT id FROM contabilidad_asiento_lineas WHERE asiento_id = ${asientoId} AND cuenta_id = ${e.cuentaId} AND debe_cents > 0 LIMIT 1`) as unknown as { id: number }[];
    if (apunte) {
      await tx.execute(sql`
        INSERT INTO contabilidad_conciliaciones (team_id, linea_id, cuenta_id, referencia, conciliado_por)
        VALUES (${teamId}, ${apunte.id}, ${e.cuentaId}, ${e.referencia}, ${userId}) ON CONFLICT (linea_id) DO NOTHING`);
    }
    await tx.execute(sql`
      UPDATE contabilidad_extracto_lineas
      SET estado = 'registrada', asiento_id = ${asientoId}, linea_id = ${apunte?.id ?? null}, metodo_emparejado = 'deposito',
          resuelta_por = ${userId}, resuelta_at = NOW()
      WHERE id = ${extractoLineaId}`);
    return { asientoId };
  });
}

export interface AsignacionDeposito {
  clienteId: number;
  cargoReferencia?: string | null;
  nota?: string | null;
}

/**
 * Identifica un depósito ya registrado: lo pasa de «Depósitos por identificar»
 * (2115) a la cuenta de saldos a favor configurada y guarda de qué cliente es.
 * Es solo contable: Cobros no usa este saldo (el saldo a favor sale de notas de
 * crédito), así que cobrar el cargo después registra el banco otra vez. Por eso
 * está tras la misma bandera apagada que «Registrar». Asiento y estado, en una
 * sola transacción.
 */
export async function asignarDeposito(teamId: number, userId: number, extractoLineaId: number, a: AsignacionDeposito): Promise<{ asientoId: number }> {
  exigirDepositosActivos();
  await exigirTablas();
  const [cli] = await db.execute(sql`SELECT razon_social AS nombre FROM clients WHERE id = ${a.clienteId} AND team_id = ${teamId}`) as unknown as { nombre: string }[];
  if (!cli) throw new ConciliacionError('Ese cliente no existe en esta empresa.', 404);
  const cargo = textoLibre(a.cargoReferencia, 120);
  const nota = textoLibre(a.nota, 300);

  const cfg = await getConfig(teamId);
  const [porIdentificar, saldoFavor] = await Promise.all([
    cuentaImputable(teamId, CODIGO.depositosPorIdentificar, userId),
    cfg.cuentaSaldosFavorId ? cuentaConfigurada(teamId, cfg.cuentaSaldosFavorId) : cuentaImputable(teamId, CODIGO.saldosFavorClientes, userId),
  ]);

  return db.transaction(async (tx) => {
    const [e] = await tx.execute(sql`
      SELECT to_char(fecha, 'YYYY-MM-DD') AS fecha, monto_cents AS monto
      FROM contabilidad_extracto_lineas
      WHERE id = ${extractoLineaId} AND team_id = ${teamId} AND estado = 'registrada' FOR UPDATE`) as unknown as { fecha: string; monto: unknown }[];
    if (!e) throw new ConciliacionError('Primero registra el depósito como «por identificar». Actualiza la pantalla.', 409);

    let asientoId: number;
    try {
      ({ asientoId } = await insertarAsientoManualTx(tx, teamId, {
        fecha: fechaDe(e.fecha),
        concepto: `Depósito identificado · ${cli.nombre}${cargo ? ` · ${cargo}` : ''}`.slice(0, 255),
        lineas: [
          { cuentaId: porIdentificar, debeCents: n(e.monto), haberCents: 0, descripcion: 'Sale de depósitos por identificar' },
          { cuentaId: saldoFavor, debeCents: 0, haberCents: n(e.monto), descripcion: `Saldo a favor de ${cli.nombre}` },
        ],
      }, userId));
    } catch (err) {
      if (err instanceof AsientoManualError) throw new ConciliacionError(err.message);
      throw err;
    }
    await tx.execute(sql`
      UPDATE contabilidad_extracto_lineas
      SET estado = 'asignada', asiento_asignacion_id = ${asientoId}, cliente_id = ${a.clienteId},
          cargo_referencia = ${cargo}, nota = ${nota}, resuelta_por = ${userId}, resuelta_at = NOW()
      WHERE id = ${extractoLineaId}`);
    return { asientoId };
  });
}
