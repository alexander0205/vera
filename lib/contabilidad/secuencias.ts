/**
 * Contabilidad — trazabilidad de e-NCF.
 *
 * La verdad de un comprobante vive repartida en TRES sitios y no siempre
 * coinciden:
 *   1. `ecf_documents` (esta app)  → lo que el sistema registró
 *   2. ecf-api (el proveedor)      → lo que se intentó y qué respondió la DGII
 *   3. la DGII                     → la verdad fiscal
 *
 * Un número puede haberse consumido de la secuencia sin dejar rastro local
 * (intento fallido), o existir en el proveedor y no aquí. Este módulo cruza las
 * fuentes para que un contador pueda responder "¿qué pasó con el E31…044?" sin
 * arqueología manual.
 */
import { db } from '@/lib/db/drizzle';
import { anulacionesNcf, ecfDocuments, sequences, users } from '@/lib/db/schema';
import { and, eq, desc, sql, count, gte, lte, inArray, or, ilike } from 'drizzle-orm';
import { emision, type EmisionResponseDto } from '@/lib/ecf-api/client';
import { getTeamProfile } from '@/lib/db/queries';

// ─── Taxonomía de estados ────────────────────────────────────────────────────
// Vive en ./estados (sin imports de servidor) para que la puedan consumir tanto
// esta capa como los componentes de cliente.
export {
  ESTADO_NCF_META, VEREDICTO_META, ESTADOS_ERROR, ESTADOS_FISCALES,
} from './estados';
export type { EstadoNcf, Veredicto, EstadoMeta } from './estados';
import { ESTADOS_ERROR, ESTADOS_FISCALES } from './estados';
import type { EstadoNcf } from './estados';

/**
 * Máximo de números que `consultarRango` inspecciona en una llamada. Es un
 * tope de rendimiento, no fiscal: cruzar el rango implica una consulta al
 * proveedor por cada hueco.
 */
export const MAX_CONSULTA_RANGO = 1000;

// ─── Helpers de formato e-NCF ────────────────────────────────────────────────

export function formatEncf(tipoEcf: string, numero: number): string {
  return `E${tipoEcf}${String(numero).padStart(10, '0')}`;
}

/** Parsea "E320000000094" → { tipo: '32', numero: 94 }. Null si no encaja. */
export function parseEncf(encf: string): { tipo: string; numero: number } | null {
  const m = /^E(\d{2})(\d{10})$/.exec(encf.trim().toUpperCase());
  if (!m) return null;
  return { tipo: m[1], numero: parseInt(m[2], 10) };
}

// ─── Anulaciones por rango ante DGII (ANECF) ─────────────────────────────────

/**
 * Números anulados ante la DGII que caen dentro de un rango.
 *
 * Solo cuentan los tramos ACEPTADOS: un ANECF en ERROR o RECHAZADO no cambió
 * nada ante la DGII, así que esos números siguen disponibles para facturar.
 *
 * Vive aquí y no en `anulacion-rangos` para evitar un ciclo de imports: ese
 * módulo depende de `consultarRango` para validar antes de enviar.
 */
export async function numerosAnuladosEnRango(
  teamId: number,
  tipoEcf: string,
  desde: number,
  hasta: number,
): Promise<Set<number>> {
  const tramos = await db
    .select({ desde: anulacionesNcf.desde, hasta: anulacionesNcf.hasta })
    .from(anulacionesNcf)
    .where(
      and(
        eq(anulacionesNcf.teamId, teamId),
        eq(anulacionesNcf.tipoEcf, tipoEcf),
        eq(anulacionesNcf.estado, 'ACEPTADO'),
        // Intervalos que solapan: tramo.desde <= hasta && tramo.hasta >= desde
        lte(anulacionesNcf.desde, hasta),
        gte(anulacionesNcf.hasta, desde),
      ),
    );

  const out = new Set<number>();
  for (const t of tramos) {
    const lo = Math.max(Number(t.desde), desde);
    const hi = Math.min(Number(t.hasta), hasta);
    for (let n = lo; n <= hi; n++) out.add(n);
  }
  return out;
}

// ─── Rangos de secuencia configurados ────────────────────────────────────────

export interface RangoSecuencia {
  id: number;
  tipoEcf: string;
  nombre: string | null;
  desde: number;
  hasta: number;
  actual: number;
  usados: number;
  disponibles: number;
  pctUsado: number;
  fechaVencimiento: Date | null;
  vencida: boolean;
  porAgotarse: boolean;
}

export async function getRangosSecuencias(teamId: number): Promise<RangoSecuencia[]> {
  const rows = await db
    .select()
    .from(sequences)
    .where(eq(sequences.teamId, teamId))
    .orderBy(sequences.tipoEcf);

  const hoy = new Date();
  return rows.map((r) => {
    const desde = Number(r.secuenciaDesde ?? 1);
    const hasta = Number(r.secuenciaHasta ?? 0);
    const actual = Number(r.secuenciaActual ?? desde);
    const usados = Math.max(0, actual - desde);
    const total = Math.max(1, hasta - desde + 1);
    const disponibles = Math.max(0, hasta - actual + 1);
    return {
      id: r.id,
      tipoEcf: r.tipoEcf,
      nombre: r.nombre ?? null,
      desde,
      hasta,
      actual,
      usados,
      disponibles,
      pctUsado: Math.min(100, Math.round((usados / total) * 100)),
      fechaVencimiento: r.fechaVencimiento ?? null,
      vencida: !!r.fechaVencimiento && r.fechaVencimiento < hoy,
      porAgotarse: disponibles > 0 && disponibles <= Math.max(10, Math.ceil(total * 0.1)),
    };
  });
}

// ─── Libro de comprobantes (tabla paginada) ──────────────────────────────────

export interface FiltrosLibro {
  tipoEcf?: string;
  estado?: string;
  desde?: string;   // YYYY-MM-DD (fecha emisión)
  hasta?: string;
  q?: string;       // e-NCF, cliente o RNC
  soloErrores?: boolean;
}

export interface FilaLibro {
  id: number;
  encf: string;
  tipoEcf: string;
  estado: string;
  estadoPago: string;
  fechaEmision: Date;
  cliente: string | null;
  rncComprador: string | null;
  montoTotal: number;
  totalItbis: number;
  trackId: string | null;
  urlVerificacion: string | null;
  emitidoPor: string | null;
  codigo: string | null;
}

/** Comprobantes con e-NCF real (excluye tickets sin-ncf y borradores sin número). */
export async function getLibroComprobantes(
  teamId: number,
  f: FiltrosLibro,
  page = 1,
  pageSize = 50,
): Promise<{ filas: FilaLibro[]; total: number }> {
  const cond = [
    eq(ecfDocuments.teamId, teamId),
    sql`${ecfDocuments.encf} ~ '^E[0-9]{12}$'`,
  ];
  if (f.tipoEcf) cond.push(eq(ecfDocuments.tipoEcf, f.tipoEcf));
  if (f.estado)  cond.push(eq(ecfDocuments.estado, f.estado));
  if (f.soloErrores) cond.push(inArray(ecfDocuments.estado, ['RECHAZADO', 'ANULADO']));
  if (f.desde) cond.push(sql`${ecfDocuments.fechaEmision}::date >= ${f.desde}`);
  if (f.hasta) cond.push(sql`${ecfDocuments.fechaEmision}::date <= ${f.hasta}`);
  if (f.q?.trim()) {
    const q = `%${f.q.trim()}%`;
    cond.push(
      or(
        ilike(ecfDocuments.encf, q),
        ilike(ecfDocuments.razonSocialComprador, q),
        ilike(ecfDocuments.rncComprador, q),
        ilike(ecfDocuments.codigo, q),
      )!,
    );
  }
  const where = and(...cond)!;

  const [filas, totalRow] = await Promise.all([
    db
      .select({
        id: ecfDocuments.id,
        encf: ecfDocuments.encf,
        tipoEcf: ecfDocuments.tipoEcf,
        estado: ecfDocuments.estado,
        estadoPago: ecfDocuments.estadoPago,
        fechaEmision: ecfDocuments.fechaEmision,
        cliente: ecfDocuments.razonSocialComprador,
        rncComprador: ecfDocuments.rncComprador,
        montoTotal: ecfDocuments.montoTotal,
        totalItbis: ecfDocuments.totalItbis,
        trackId: ecfDocuments.trackId,
        urlVerificacion: ecfDocuments.urlVerificacion,
        emitidoPor: users.name,
        codigo: ecfDocuments.codigo,
      })
      .from(ecfDocuments)
      .leftJoin(users, eq(users.id, ecfDocuments.createdBy))
      .where(where)
      .orderBy(desc(ecfDocuments.fechaEmision), desc(ecfDocuments.encf))
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    db.select({ c: count() }).from(ecfDocuments).where(where),
  ]);

  return { filas: filas as FilaLibro[], total: Number(totalRow[0]?.c ?? 0) };
}

// ─── Consulta de rango (cruce de las 3 fuentes) ──────────────────────────────

export interface FilaConsulta {
  numero: number;
  encf: string;
  estado: EstadoNcf;
  /** Motivo legible cuando el estado es problemático. */
  motivo: string | null;
  fecha: Date | string | null;
  cliente: string | null;
  rncComprador: string | null;
  montoTotal: number | null;
  trackId: string | null;
  urlVerificacion: string | null;
  /** Id del documento local, para enlazar a la factura. */
  documentoId: number | null;
  /** Qué sabe el proveedor (ecf-api) de este número. */
  proveedor: { estado: string; enviadoEn: string | null; ambiente: string | null } | null;
}

export interface ResumenConsulta {
  total: number;
  porEstado: Record<string, number>;
  fiscales: number;      // llegaron a la DGII
  conError: number;      // requieren atención
  tasaExito: number;     // 0..1 sobre números consumidos
}

/** Descarga todas las emisiones del proveedor y las indexa por e-NCF. */
async function indexarProveedor(codigoPublico: string): Promise<Map<string, EmisionResponseDto>> {
  const idx = new Map<string, EmisionResponseDto>();
  let cursor: string | undefined;
  // Tope de seguridad: 20 páginas × 200 = 4.000 emisiones.
  for (let i = 0; i < 20; i++) {
    const page = await emision.listPaged(codigoPublico, { limit: 200, ...(cursor ? { cursor } : {}) });
    for (const e of page.data ?? []) {
      if (e.eNcf) idx.set(e.eNcf, e as unknown as EmisionResponseDto);
    }
    const p = page.pagination as { hasMore?: boolean; nextCursor?: string } | undefined;
    if (!p?.hasMore || !p.nextCursor) break;
    cursor = p.nextCursor;
  }
  return idx;
}

/** Traduce el registro del proveedor a un estado + motivo legible. */
function clasificarProveedor(e: EmisionResponseDto): { estado: EstadoNcf; motivo: string } {
  const est = String(e.estado ?? '').toUpperCase();
  const enviado = !!(e as unknown as { enviadoEn?: string | null }).enviadoEn;

  if (est === 'ACEPTADO' || est === 'ACEPTADO_CONDICIONAL') {
    return {
      estado: 'EN_DGII_SIN_REGISTRO',
      motivo: 'La DGII aceptó este comprobante pero no está registrado en el sistema. Requiere revisión.',
    };
  }
  if (est === 'RECHAZADO') {
    const msg = e.mensajesDgii ? JSON.stringify(e.mensajesDgii).slice(0, 300) : null;
    return { estado: 'RECHAZADO', motivo: msg ? `Rechazado por la DGII: ${msg}` : 'Rechazado por la DGII.' };
  }
  if (est === 'ERROR') {
    return {
      estado: 'FALLIDO',
      motivo: enviado
        ? 'Se envió a la DGII pero respondió con error. No quedó registrado como válido.'
        : 'Error al intentar enviarlo. Nunca llegó a la DGII.',
    };
  }
  // PENDIENTE u otros sin enviar
  return {
    estado: 'FALLIDO',
    motivo: 'Se reservó el número en el proveedor pero nunca se transmitió a la DGII (envío interrumpido).',
  };
}

/**
 * Consulta un rango de números de un tipo. Devuelve UNA fila por número —
 * incluidos los huecos, que es justo lo que preguntan los contadores.
 */
export async function consultarRango(
  teamId: number,
  tipoEcf: string,
  desde: number,
  hasta: number,
): Promise<{ filas: FilaConsulta[]; resumen: ResumenConsulta }> {
  if (hasta < desde) [desde, hasta] = [hasta, desde];
  // Tope duro: evita que una consulta 1–1.000.000 tumbe la página. Quien
  // necesite recorrer más números lo hace por bloques (ver `revisarTramo`).
  if (hasta - desde + 1 > MAX_CONSULTA_RANGO) hasta = desde + MAX_CONSULTA_RANGO - 1;

  const encfs = Array.from({ length: hasta - desde + 1 }, (_, i) => formatEncf(tipoEcf, desde + i));

  const [docs, seq, team, anulados] = await Promise.all([
    db
      .select({
        id: ecfDocuments.id,
        encf: ecfDocuments.encf,
        estado: ecfDocuments.estado,
        fechaEmision: ecfDocuments.fechaEmision,
        cliente: ecfDocuments.razonSocialComprador,
        rncComprador: ecfDocuments.rncComprador,
        montoTotal: ecfDocuments.montoTotal,
        trackId: ecfDocuments.trackId,
        urlVerificacion: ecfDocuments.urlVerificacion,
        mensajesDgii: ecfDocuments.mensajesDgii,
      })
      .from(ecfDocuments)
      .where(and(eq(ecfDocuments.teamId, teamId), inArray(ecfDocuments.encf, encfs))),
    db
      .select()
      .from(sequences)
      .where(and(eq(sequences.teamId, teamId), eq(sequences.tipoEcf, tipoEcf)))
      .limit(1),
    getTeamProfile(teamId),
    numerosAnuladosEnRango(teamId, tipoEcf, desde, hasta),
  ]);

  const porEncf = new Map(docs.map((d) => [d.encf, d]));
  const actual = Number(seq[0]?.secuenciaActual ?? 0);

  // El proveedor solo se consulta si hay huecos que explicar.
  const hayHuecos = encfs.some((e) => !porEncf.has(e));
  let prov: Map<string, EmisionResponseDto> = new Map();
  if (hayHuecos && team?.ecfCodigoPublico) {
    prov = await indexarProveedor(team.ecfCodigoPublico).catch(() => new Map());
  }

  const filas: FilaConsulta[] = encfs.map((encf, i) => {
    const numero = desde + i;
    const d = porEncf.get(encf);
    const p = prov.get(encf);
    const proveedor = p
      ? {
          estado: String(p.estado ?? ''),
          enviadoEn: (p as unknown as { enviadoEn?: string | null }).enviadoEn ?? null,
          ambiente: p.ambiente ?? null,
        }
      : null;

    // Anulado por rango ante la DGII (ANECF aceptado). No cortocircuita las
    // ramas de abajo: si el número además tiene rastro local o en el proveedor,
    // ese detalle sigue siendo el que explica qué pasó — la anulación se suma
    // como nota. Solo manda cuando no hay rastro en ningún lado (rama 3).
    const anuladoDgii = anulados.has(numero);
    const notaAnulado = 'Este número se anuló ante la DGII por rango (ANECF): ya no puede usarse en una factura.';

    // 1. Existe localmente → su estado manda.
    if (d) {
      const est = String(d.estado).toUpperCase();
      const estado: EstadoNcf =
        est === 'BORRADOR' ? 'RESERVADO' : (est as EstadoNcf);
      let motivo: string | null = null;
      if (estado === 'RECHAZADO') {
        motivo = d.mensajesDgii ? `Rechazado por la DGII: ${String(d.mensajesDgii).slice(0, 300)}` : 'Rechazado por la DGII.';
      } else if (estado === 'RESERVADO') {
        motivo = 'Número reservado para una factura en borrador. Aún no se ha enviado a la DGII.';
      }
      if (anuladoDgii) motivo = motivo ? `${motivo} ${notaAnulado}` : notaAnulado;
      return {
        numero, encf, estado, motivo,
        fecha: d.fechaEmision,
        cliente: d.cliente,
        rncComprador: d.rncComprador,
        montoTotal: d.montoTotal,
        trackId: d.trackId,
        urlVerificacion: d.urlVerificacion,
        documentoId: d.id,
        proveedor,
      };
    }

    // 2. No está local pero sí en el proveedor → intento fallido (o peor).
    if (p) {
      const { estado, motivo } = clasificarProveedor(p);
      return {
        numero, encf, estado,
        motivo: anuladoDgii ? (motivo ? `${motivo} ${notaAnulado}` : notaAnulado) : motivo,
        fecha: p.fechaEmision ?? null,
        cliente: null,
        rncComprador: null,
        montoTotal: typeof p.montoTotal === 'number' ? Math.round(p.montoTotal * 100) : null,
        trackId: p.trackId ?? null,
        urlVerificacion: p.urlVerificacion ?? null,
        documentoId: null,
        proveedor,
      };
    }

    // 3. Sin rastro en ningún lado → aquí la anulación por rango es la
    // explicación completa del número.
    if (anuladoDgii) {
      return {
        numero, encf, estado: 'ANULADO_DGII', motivo: notaAnulado,
        fecha: null, cliente: null, rncComprador: null, montoTotal: null,
        trackId: null, urlVerificacion: null, documentoId: null, proveedor: null,
      };
    }

    const consumido = actual > 0 && numero < actual;
    return {
      numero, encf,
      estado: consumido ? 'NO_GENERADO' : 'SIN_USAR',
      motivo: consumido
        ? 'El número se consumió de la secuencia pero no dejó rastro en el sistema ni en el proveedor. Suele ser un error de validación antes de enviar. Nunca llegó a la DGII.'
        : null,
      fecha: null, cliente: null, rncComprador: null, montoTotal: null,
      trackId: null, urlVerificacion: null, documentoId: null, proveedor: null,
    };
  });

  // Resumen
  const porEstado: Record<string, number> = {};
  for (const f of filas) porEstado[f.estado] = (porEstado[f.estado] ?? 0) + 1;
  const consumidos = filas.filter((f) => f.estado !== 'SIN_USAR').length;
  const fiscales = filas.filter((f) => ESTADOS_FISCALES.includes(f.estado)).length;
  const conError = filas.filter((f) => ESTADOS_ERROR.includes(f.estado)).length;

  return {
    filas,
    resumen: {
      total: filas.length,
      porEstado,
      fiscales,
      conError,
      tasaExito: consumidos > 0 ? fiscales / consumidos : 0,
    },
  };
}

/** Consulta un e-NCF puntual. Atajo sobre `consultarRango`. */
export async function consultarEncf(teamId: number, encf: string): Promise<FilaConsulta | null> {
  const p = parseEncf(encf);
  if (!p) return null;
  const { filas } = await consultarRango(teamId, p.tipo, p.numero, p.numero);
  return filas[0] ?? null;
}
