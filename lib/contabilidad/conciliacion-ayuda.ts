/**
 * «Ayúdame a conciliar»: el lado con base de datos.
 *
 * Reúne lo pendiente del estado de cuenta, lo no conciliado del libro y, para
 * lo que las reglas no resuelven, un conjunto PEQUEÑO de candidatos por línea
 * (apuntes del libro parecidos, clientes nombrados en la descripción con sus
 * facturas abiertas) que se le da al modelo. Todo de UNA empresa.
 *
 * No cambia el esquema ni aplica nada solo. Lo único que escribe es
 * `aceptarCargoBancario`, que usa las funciones de siempre (`registrarMovimiento`
 * y `emparejarExtracto`) y solo cuando la persona pulsa «Registrar cargo».
 */

import { sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { cuentasBanco, registrarMovimiento, tablaExiste, MovimientoBancarioError, MOVIMIENTO_MAX_CENTS } from './bancos';
import { asegurarCuentaBaseDetalle } from './catalogo-base';
import { ConciliacionError, emparejarExtracto } from './conciliacion';
import { getCuentasPorCobrar } from '@/lib/db/queries';
import { hoyRD } from '@/lib/utils/format';
import { validarSalida, type LlamadaModelo } from './extracto-ia';
import {
  ayudaDeterminista, candidatosLibro, clientesEnDescripcion, construirPeticionAyuda, conceptoDeCargo,
  limpiarSugerenciasIa, resumenParaCuadrar, esquemaAyuda, MAX_LINEAS_IA,
  type ApunteLibro, type ClienteCandidato, type EntradaAyudaIa, type LineaAyuda, type SugerenciaAyuda,
} from './conciliacion-ayuda-reglas';

const n = (v: unknown) => Number(v ?? 0);
const TABLAS = ['contabilidad_extractos', 'contabilidad_extracto_lineas', 'contabilidad_conciliaciones'] as const;
/** Código del catálogo base: «Gastos financieros y comisiones bancarias». */
export const CODIGO_GASTOS_BANCARIOS = '6117';
const TOPE_PENDIENTES = 300;
const DIAS_VENTANA = 45;

async function bancoActivo(teamId: number, cuentaId: number) {
  const b = (await cuentasBanco(teamId)).find((c) => c.id === cuentaId && c.imputable && c.activa);
  if (!b) throw new ConciliacionError('Esa cuenta no es una caja o un banco activo de la empresa.', 400);
  return b;
}

export interface ContextoAyuda { pendientes: LineaAyuda[]; totalPendientes: number; libro: ApunteLibro[] }

/** Lo pendiente del extracto y lo libre del libro de una cuenta (con margen de 45 días). */
export async function cargarContextoAyuda(teamId: number, cuentaId: number): Promise<ContextoAyuda> {
  for (const t of TABLAS) if (!await tablaExiste(t)) throw new ConciliacionError('Importar el estado de cuenta necesita una actualización de la base que aún no se aplica.', 503);
  await bancoActivo(teamId, cuentaId);

  const filas = await db.execute(sql`
    SELECT id, to_char(fecha, 'YYYY-MM-DD') AS fecha, descripcion, referencia, monto_cents AS monto
    FROM contabilidad_extracto_lineas
    WHERE team_id = ${teamId} AND cuenta_id = ${cuentaId} AND estado = 'pendiente'
    ORDER BY fecha, id LIMIT ${TOPE_PENDIENTES + 1}`) as unknown as { id: number; fecha: string; descripcion: string | null; referencia: string | null; monto: unknown }[];
  const pendientes: LineaAyuda[] = filas.slice(0, TOPE_PENDIENTES).map((f) => ({
    id: f.id, fecha: f.fecha, descripcion: f.descripcion, referencia: f.referencia, montoCents: n(f.monto),
  }));
  if (pendientes.length === 0) return { pendientes, totalPendientes: 0, libro: [] };

  const fechas = pendientes.map((p) => p.fecha).sort();
  const libroFilas = await db.execute(sql`
    SELECT l.id AS "lineaId", to_char(a.fecha, 'YYYY-MM-DD') AS fecha,
           left(concat_ws(' ', a.concepto, l.descripcion), 160) AS concepto, (l.debe_cents - l.haber_cents) AS monto
    FROM contabilidad_asiento_lineas l
    JOIN contabilidad_asientos a ON a.id = l.asiento_id
    WHERE l.team_id = ${teamId} AND l.cuenta_id = ${cuentaId}
      AND NOT EXISTS (SELECT 1 FROM contabilidad_extracto_lineas e WHERE e.linea_id = l.id AND e.team_id = ${teamId})
      AND a.fecha >= ${fechas[0]}::date - (${DIAS_VENTANA}::int * interval '1 day')
      AND a.fecha <= ${fechas[fechas.length - 1]}::date + (${DIAS_VENTANA}::int * interval '1 day')
    ORDER BY a.fecha, l.id LIMIT 3000`) as unknown as { lineaId: number; fecha: string; concepto: string | null; monto: unknown }[];
  return {
    pendientes,
    totalPendientes: filas.length > TOPE_PENDIENTES ? TOPE_PENDIENTES + 1 : pendientes.length,
    libro: libroFilas.map((f) => ({ lineaId: f.lineaId, fecha: f.fecha, concepto: f.concepto ?? '', montoCents: n(f.monto) })),
  };
}

/** Clientes de la empresa nombrados en las descripciones, con sus facturas abiertas (pocas). */
async function clientesCandidatos(teamId: number, lineas: readonly LineaAyuda[]): Promise<Map<number, ClienteCandidato[]>> {
  const salida = new Map<number, ClienteCandidato[]>();
  const entradas = lineas.filter((l) => l.montoCents > 0);
  if (entradas.length === 0) return salida;

  const todos = await db.execute(sql`
    SELECT id, razon_social AS "razonSocial", rnc FROM clients WHERE team_id = ${teamId} ORDER BY id LIMIT 5000`) as unknown as { id: number; razonSocial: string; rnc: string | null }[];
  const idsPorLinea = new Map(entradas.map((l) => [l.id, clientesEnDescripcion(l.descripcion, todos)]));
  const distintos = [...new Set([...idsPorLinea.values()].flat())].slice(0, 40);

  const info = new Map<number, ClienteCandidato>();
  for (const id of distintos) {
    const c = todos.find((x) => x.id === id)!;
    const { cuentas } = await getCuentasPorCobrar(teamId, { clientId: id, limit: 8, orden: 'antiguo' });
    info.set(id, {
      clienteId: id, nombre: c.razonSocial, rnc: c.rnc,
      abiertas: cuentas.filter((x) => x.saldo > 0).map((x) => ({
        id: x.id, documento: x.codigo ?? x.encf ?? `#${x.id}`, fecha: x.fechaEmision, saldoCents: x.saldo,
      })),
    });
  }
  for (const [lineaId, ids] of idsPorLinea) {
    const lista = ids.map((i) => info.get(i)).filter((x): x is ClienteCandidato => !!x);
    if (lista.length > 0) salida.set(lineaId, lista);
  }
  return salida;
}

export interface ResultadoAyuda {
  /** «Para cuadrar te faltan: …» */
  resumen: string;
  sugerencias: SugerenciaAyuda[];
  /** Cuántas líneas pendientes se miraron (con tope). */
  lineasRevisadas: number;
  /** Hay más pendientes que el tope: se miraron las más antiguas. */
  truncado: boolean;
  /** Se llamó al modelo, con cuál, y si falló (las reglas se entregan igual). */
  ia: { disponible: boolean; usada: boolean; modelo: string | null; lineas: number; error: string | null };
}

/**
 * Lo determinista siempre; la IA solo para lo que queda y solo si hay modelo
 * (`llamar` null = sin IA). Un fallo del modelo no tira lo de las reglas.
 */
export async function ayudaConciliar(teamId: number, cuentaId: number, llamar: LlamadaModelo | null): Promise<ResultadoAyuda> {
  const ctx = await cargarContextoAyuda(teamId, cuentaId);
  const det = ayudaDeterminista(ctx.pendientes, ctx.libro);
  const sugerencias = [...det.sugerencias];
  const ia: ResultadoAyuda['ia'] = { disponible: llamar !== null, usada: false, modelo: null, lineas: 0, error: null };

  const lote = det.paraIa.slice(0, MAX_LINEAS_IA);
  if (llamar && lote.length > 0) {
    try {
      const clientes = await clientesCandidatos(teamId, lote);
      const entradas: EntradaAyudaIa[] = lote.map((linea) => ({
        linea, libro: candidatosLibro(linea, ctx.libro), clientes: clientes.get(linea.id) ?? [],
      }));
      // Sin ningún candidato la IA no tiene con qué ayudar: no se paga la llamada por esa línea.
      const conAlgo = entradas.filter((e) => e.libro.length > 0 || e.clientes.length > 0 || e.linea.montoCents < 0);
      if (conAlgo.length > 0) {
        const r = await llamar(construirPeticionAyuda(conAlgo));
        sugerencias.push(...limpiarSugerenciasIa(validarSalida(esquemaAyuda, r.salida), conAlgo));
        ia.usada = true; ia.modelo = r.modelo; ia.lineas = conAlgo.length;
      }
    } catch (e) {
      ia.error = e instanceof Error ? e.message : 'La IA no pudo ayudar ahora.';
    }
  }
  // Una sola sugerencia por línea; las de regla mandan sobre las de IA.
  const vistas = new Set<number>();
  const unicas = sugerencias.filter((s) => (vistas.has(s.lineaId) ? false : (vistas.add(s.lineaId), true)));
  return {
    resumen: resumenParaCuadrar(det.resumen), sugerencias: unicas,
    lineasRevisadas: ctx.pendientes.length, truncado: ctx.totalPendientes > ctx.pendientes.length, ia,
  };
}

// ── «Registrar cargo» ────────────────────────────────────────────────────────

export interface CuentaGastoBancario { id: number; codigo: string; nombre: string }

/** La cuenta de gastos bancarios de la empresa, SIN crearla (para enseñarla en la pantalla). null si aún no existe. */
export async function cuentaGastosBancarios(teamId: number): Promise<CuentaGastoBancario | null> {
  const [c] = await db.execute(sql`
    SELECT id, codigo, nombre FROM contabilidad_cuentas
    WHERE team_id = ${teamId} AND codigo = ${CODIGO_GASTOS_BANCARIOS} AND tipo = 'gasto' AND activa AND imputable
    LIMIT 1`) as unknown as CuentaGastoBancario[];
  return c ?? null;
}

/** Lo que se le enseña a quien va a registrar el cargo: ya lleno, para confirmar. */
export interface PrellenadoCargo {
  lineaId: number; fecha: string; montoCents: number; concepto: string; cuenta: { id: number | null; codigo: string; nombre: string; existe: boolean };
}

export async function prellenarCargo(teamId: number, lineaId: number): Promise<PrellenadoCargo> {
  const l = await lineaPendienteSalida(teamId, lineaId);
  const c = await cuentaGastosBancarios(teamId);
  return {
    lineaId, fecha: l.fecha, montoCents: Math.abs(l.montoCents), concepto: conceptoDeCargo(l.descripcion),
    cuenta: c ? { id: c.id, codigo: c.codigo, nombre: c.nombre, existe: true } : { id: null, codigo: CODIGO_GASTOS_BANCARIOS, nombre: 'Gastos financieros y comisiones bancarias', existe: false },
  };
}

async function lineaPendienteSalida(teamId: number, lineaId: number) {
  const [l] = await db.execute(sql`
    SELECT id, cuenta_id AS "cuentaId", to_char(fecha, 'YYYY-MM-DD') AS fecha, descripcion, monto_cents AS monto, estado
    FROM contabilidad_extracto_lineas WHERE id = ${lineaId} AND team_id = ${teamId}`) as unknown as
    { id: number; cuentaId: number; fecha: string; descripcion: string | null; monto: unknown; estado: string }[];
  if (!l) throw new ConciliacionError('La línea del estado de cuenta no existe.', 404);
  if (l.estado !== 'pendiente') throw new ConciliacionError('Esa línea ya está resuelta. Actualiza la pantalla.', 409);
  const monto = n(l.monto);
  if (monto >= 0) throw new ConciliacionError('Solo se registra como cargo una salida de dinero del banco.', 422);
  if (-monto > MOVIMIENTO_MAX_CENTS) throw new ConciliacionError('El monto es demasiado grande para un cargo bancario.', 422);
  return { id: l.id, cuentaId: l.cuentaId, fecha: l.fecha, descripcion: l.descripcion, montoCents: monto };
}

export interface ResultadoCargo { asientoId: number; emparejada: boolean }

/**
 * Registra el cargo del banco (débito a la cuenta de gastos bancarios, crédito al
 * banco) con el mismo `registrarMovimiento` del formulario de Bancos y vuelve a
 * emparejar, para que la línea quede unida a su asiento. El concepto lo puede
 * ajustar la persona; el monto y la fecha son los del banco.
 */
export async function registrarCargoDeLinea(
  teamId: number, userId: number, lineaId: number, concepto?: string | null, cuentaGastoId?: number | null,
): Promise<ResultadoCargo> {
  const l = await lineaPendienteSalida(teamId, lineaId);
  let gastoId: number;
  if (cuentaGastoId) {
    // La que eligió la persona: de esta empresa, de gasto, activa y que acepte apuntes.
    const [c] = await db.execute(sql`
      SELECT tipo, imputable, activa FROM contabilidad_cuentas WHERE id = ${cuentaGastoId} AND team_id = ${teamId}`) as unknown as { tipo: string; imputable: boolean; activa: boolean }[];
    if (!c || c.tipo !== 'gasto' || !c.imputable || !c.activa) throw new ConciliacionError('Elige una cuenta de gasto activa que acepte movimientos.', 422);
    gastoId = cuentaGastoId;
  } else {
    // Por defecto 6117 (se agrega al catálogo si falta).
    const cuenta = await asegurarCuentaBaseDetalle(teamId, CODIGO_GASTOS_BANCARIOS, userId);
    if (!cuenta) throw new ConciliacionError('No hay cuenta de gastos bancarios en el catálogo.', 422);
    gastoId = cuenta.id;
  }

  const texto = (concepto ?? '').replace(/\s+/g, ' ').trim().slice(0, 200) || conceptoDeCargo(l.descripcion);
  let asientoId: number;
  try {
    ({ asientoId } = await registrarMovimiento(teamId, userId, {
      kind: 'cargo', fecha: l.fecha, cuentaId: l.cuentaId, cuentaGastoId: gastoId, montoCents: -l.montoCents, concepto: texto,
    }, hoyRD()));
  } catch (e) {
    if (e instanceof MovimientoBancarioError) throw new ConciliacionError(e.message, e.status);
    throw e;
  }
  await emparejarExtracto(teamId, userId, l.cuentaId);
  const [despues] = await db.execute(sql`
    SELECT estado FROM contabilidad_extracto_lineas WHERE id = ${lineaId} AND team_id = ${teamId}`) as unknown as { estado: string }[];
  return { asientoId, emparejada: despues?.estado === 'emparejada' };
}
