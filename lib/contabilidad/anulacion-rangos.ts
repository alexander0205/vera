/**
 * Contabilidad — anulación de rangos de e-NCF ante DGII (ANECF).
 *
 * La DGII expone un solo servicio de anulación (`anulacionrangos/anularrango`)
 * y trabaja por TRAMOS de secuencias no utilizadas, no por comprobante. Un e-CF
 * ya aceptado no se anula: se revierte con Nota de Crédito (tipo 34).
 *
 * El flujo tiene dos pasos deliberadamente separados:
 *   1. `revisarTramo` — dice qué hay dentro del tramo y si es anulable. No
 *      toca nada. La UI lo usa para mostrar el veredicto antes de confirmar.
 *   2. `anularTramo` — vuelve a validar (el estado pudo cambiar entre el
 *      preview y el clic), manda el ANECF firmado vía ecf-api y persiste.
 *
 * La validación se repite a propósito en el paso 2: es la única que cuenta.
 */
import { db } from '@/lib/db/drizzle';
import { anulacionesNcf, users } from '@/lib/db/schema';
import { eq, desc } from 'drizzle-orm';
import { anecf, EcfApiError } from '@/lib/ecf-api/client';
import { getTeamProfile } from '@/lib/db/queries';
import {
  consultarRango, formatEncf, numerosAnuladosEnRango, MAX_CONSULTA_RANGO,
} from './secuencias';
import {
  ESTADOS_ANULABLES_ANECF, MOTIVO_BLOQUEO_ANECF, ESTADO_NCF_META,
  type EstadoNcf,
} from './estados';

/** Tope del XSD ANECF v1.0: 10.000 secuencias por bloque `<Anulacion>`. */
export const MAX_ANECF_POR_ENVIO = 10_000;

// ─── Preview ─────────────────────────────────────────────────────────────────

export interface BloqueoTramo {
  encf: string;
  numero: number;
  estado: EstadoNcf;
  /** Etiqueta de contabilidad del estado, para no re-derivarla en el cliente. */
  estadoLabel: string;
  motivo: string;
  /** Id de la factura, cuando el número tiene un documento en el sistema. */
  documentoId: number | null;
  /** Enlace de verificación en la DGII, si el comprobante llegó a emitirse. */
  urlVerificacion: string | null;
}

export interface RevisionTramo {
  tipoEcf: string;
  desde: number;
  hasta: number;
  /** Total de números en el tramo (hasta - desde + 1). */
  total: number;
  /** Cuántos se anularían realmente. */
  anulables: number;
  /** Cuántos ya se habían anulado antes — se ignoran, no son un error. */
  yaAnulados: number;
  /** Números que impiden mandar el tramo. Vacío = se puede anular. */
  bloqueos: BloqueoTramo[];
  /** Desglose por estado de lo que sí se anularía. */
  porEstado: Record<string, number>;
  ok: boolean;
}

/**
 * Inspecciona un tramo sin tocar nada. DGII no acepta anulaciones parciales de
 * un tramo, así que un solo número bloqueante invalida el envío completo —
 * devolvemos TODOS los bloqueos para que el usuario ajuste el rango de una vez
 * en lugar de descubrirlos uno por uno.
 */
export async function revisarTramo(
  teamId: number,
  tipoEcf: string,
  desde: number,
  hasta: number,
): Promise<RevisionTramo> {
  if (hasta < desde) [desde, hasta] = [hasta, desde];
  const total = hasta - desde + 1;

  // El set de ya-anulados se consulta aparte y no se deriva del estado de la
  // fila: si un número anulado además tiene un doc local (p. ej. RECHAZADO),
  // `consultarRango` prioriza ese estado y volveríamos a mandarlo a la DGII.
  const yaAnuladosSet = await numerosAnuladosEnRango(teamId, tipoEcf, desde, hasta);

  const bloqueos: BloqueoTramo[] = [];
  const porEstado: Record<string, number> = {};
  let anulables = 0;
  let yaAnulados = 0;

  // `consultarRango` topa en MAX_CONSULTA_RANGO números por llamada, así que el
  // tramo se recorre por bloques. Sin esto, un tramo de 5.000 se validaría solo
  // en sus primeros 1.000 y los otros 4.000 se anularían sin revisar — que es
  // exactamente el error que este módulo existe para evitar.
  for (let lo = desde; lo <= hasta; lo += MAX_CONSULTA_RANGO) {
    const hi = Math.min(lo + MAX_CONSULTA_RANGO - 1, hasta);
    const { filas } = await consultarRango(teamId, tipoEcf, lo, hi);

    for (const f of filas) {
      if (yaAnuladosSet.has(f.numero)) {
        yaAnulados++;
        continue;
      }
      if (ESTADOS_ANULABLES_ANECF.includes(f.estado)) {
        anulables++;
        porEstado[f.estado] = (porEstado[f.estado] ?? 0) + 1;
        continue;
      }
      bloqueos.push({
        encf:        f.encf,
        numero:      f.numero,
        estado:      f.estado,
        estadoLabel: ESTADO_NCF_META[f.estado]?.label ?? f.estado,
        motivo:      MOTIVO_BLOQUEO_ANECF[f.estado]
          ?? 'No se puede anular por rango. Revísalo con soporte.',
        // Un bloqueo sin salida es una pared: el usuario necesita abrir la
        // factura para resolverla (emitir la NC, mandar el borrador, etc.).
        documentoId:     f.documentoId,
        urlVerificacion: f.urlVerificacion,
      });
    }
  }

  return {
    tipoEcf, desde, hasta, total,
    anulables, yaAnulados, bloqueos, porEstado,
    ok: bloqueos.length === 0 && anulables > 0,
  };
}

// ─── Envío ───────────────────────────────────────────────────────────────────

export class AnulacionTramoError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly detalle?: unknown,
  ) {
    super(message);
    this.name = 'AnulacionTramoError';
  }
}

export interface ResultadoAnulacion {
  id: number;
  tipoEcf: string;
  desde: number;
  hasta: number;
  /** Números del tramo enviado a la DGII (hasta - desde + 1). */
  cantidad: number;
  /** De esos, cuántos no estaban anulados antes de este envío. */
  nuevos: number;
  estado: string;
  trackId: string | null;
  aceptado: boolean;
}

/**
 * Manda el tramo a DGII y guarda el resultado.
 *
 * El registro local se crea ANTES del envío: si ecf-api o DGII fallan a mitad
 * de camino queda constancia de que se intentó, con el error adjunto. Un envío
 * huérfano (ANECF que DGII procesó pero cuya respuesta se perdió) es peor que
 * un registro en ERROR que el usuario puede reintentar viendo qué pasó.
 */
export async function anularTramo(
  teamId: number,
  userId: number,
  input: { tipoEcf: string; desde: number; hasta: number; motivo?: string },
): Promise<ResultadoAnulacion> {
  let { desde, hasta } = input;
  const { tipoEcf } = input;
  if (hasta < desde) [desde, hasta] = [hasta, desde];

  if (!Number.isInteger(desde) || !Number.isInteger(hasta) || desde < 1) {
    throw new AnulacionTramoError('Rango inválido. Usa números enteros positivos.', 400);
  }
  const cantidad = hasta - desde + 1;
  if (cantidad > MAX_ANECF_POR_ENVIO) {
    throw new AnulacionTramoError(
      `El tramo tiene ${cantidad.toLocaleString('es-DO')} números y la DGII acepta máximo ` +
      `${MAX_ANECF_POR_ENVIO.toLocaleString('es-DO')} por envío. Divídelo en varios.`,
      400,
    );
  }

  const team = await getTeamProfile(teamId);
  if (!team?.ecfCodigoPublico) {
    throw new AnulacionTramoError(
      'Esta empresa no está conectada a la DGII todavía. Sube el certificado digital primero.',
      409,
    );
  }

  // Revalidar — el preview pudo quedar viejo (alguien emitió en el intermedio).
  const revision = await revisarTramo(teamId, tipoEcf, desde, hasta);
  if (revision.bloqueos.length > 0) {
    throw new AnulacionTramoError(
      `El tramo contiene ${revision.bloqueos.length} comprobante(s) que no se pueden anular por rango.`,
      409,
      revision,
    );
  }
  if (revision.anulables === 0) {
    throw new AnulacionTramoError(
      revision.yaAnulados > 0
        ? 'Todos los números de este tramo ya estaban anulados ante la DGII.'
        : 'No hay nada que anular en este tramo.',
      409,
      revision,
    );
  }

  const [registro] = await db
    .insert(anulacionesNcf)
    .values({
      teamId, tipoEcf, desde, hasta,
      // Lo que la DGII recibe es el tramo completo, así que el registro lo
      // espeja. `revision.anulables` es cuántos eran nuevos, no lo enviado.
      cantidad:  cantidad,
      estado:    'PENDIENTE',
      motivo:    input.motivo?.trim() || null,
      createdBy: userId,
    })
    .returning({ id: anulacionesNcf.id });

  try {
    const res = await anecf.create(team.ecfCodigoPublico, {
      rangos: [{ tipoComprobante: tipoEcf, desde, hasta }],
    });

    const estado  = String(res.estado ?? 'ENVIADO').toUpperCase();
    const trackId = res.trackId ?? null;

    await db
      .update(anulacionesNcf)
      .set({
        estado,
        anulacionId:   res.id ?? null,
        trackId,
        respuestaDgii: (res as unknown) ?? null,
        updatedAt:     new Date(),
      })
      .where(eq(anulacionesNcf.id, registro.id));

    return {
      id: registro.id,
      tipoEcf, desde, hasta,
      cantidad,
      nuevos: revision.anulables,
      estado, trackId,
      aceptado: estado === 'ACEPTADO',
    };
  } catch (err) {
    // ecf-api devuelve 503 con `{ message, anulacionId, dgii }` cuando DGII
    // falla; el texto crudo es lo único accionable para soporte.
    const detalle = err instanceof EcfApiError
      ? { status: err.status, body: err.message }
      : { message: (err as Error)?.message ?? 'error desconocido' };

    await db
      .update(anulacionesNcf)
      .set({ estado: 'ERROR', respuestaDgii: detalle, updatedAt: new Date() })
      .where(eq(anulacionesNcf.id, registro.id))
      .catch(() => {});

    console.error('[anulacion-rangos] ANECF falló', { teamId, tipoEcf, desde, hasta, detalle });
    throw new AnulacionTramoError(
      'La DGII no procesó la anulación. Quedó registrada como fallida — puedes reintentarla.',
      502,
      detalle,
    );
  }
}

// ─── Consulta de tramos ya anulados ──────────────────────────────────────────

export interface TramoAnulado {
  id: number;
  tipoEcf: string;
  desde: number;
  hasta: number;
  cantidad: number;
  estado: string;
  trackId: string | null;
  motivo: string | null;
  encfDesde: string;
  encfHasta: string;
  createdAt: Date;
  creadoPor: string | null;
}

/** Histórico de anulaciones por rango del equipo, más reciente primero. */
export async function listarTramosAnulados(
  teamId: number,
  opts?: { limit?: number },
): Promise<TramoAnulado[]> {
  const rows = await db
    .select({
      id:        anulacionesNcf.id,
      tipoEcf:   anulacionesNcf.tipoEcf,
      desde:     anulacionesNcf.desde,
      hasta:     anulacionesNcf.hasta,
      cantidad:  anulacionesNcf.cantidad,
      estado:    anulacionesNcf.estado,
      trackId:   anulacionesNcf.trackId,
      motivo:    anulacionesNcf.motivo,
      createdAt: anulacionesNcf.createdAt,
      creadoPor: users.name,
    })
    .from(anulacionesNcf)
    .leftJoin(users, eq(users.id, anulacionesNcf.createdBy))
    .where(eq(anulacionesNcf.teamId, teamId))
    .orderBy(desc(anulacionesNcf.createdAt))
    .limit(Math.min(opts?.limit ?? 50, 200));

  return rows.map((r) => ({
    ...r,
    desde:     Number(r.desde),
    hasta:     Number(r.hasta),
    encfDesde: formatEncf(r.tipoEcf, Number(r.desde)),
    encfHasta: formatEncf(r.tipoEcf, Number(r.hasta)),
  }));
}
