/**
 * lib/cobranza/seguimiento.ts — Gestión de cobro de una cuenta: log de
 * contactos/notas/promesas y estado actual (responsable, próxima acción).
 *
 * El estado de una promesa NO se recalcula solo: 'pendiente' pasa a 'cumplida'
 * o 'incumplida' cuando alguien lo marca, o cuando `evaluarPromesasVencidas`
 * corre. Se guarda persistido en vez de derivarlo al vuelo porque "se cumplió"
 * depende de si el pago llegó por esta factura y a tiempo, y eso hay que
 * congelarlo: si mañana el cliente paga, la promesa incumplida de ayer sigue
 * habiendo sido incumplida.
 */

import { db } from '@/lib/db/drizzle';
import { sql } from 'drizzle-orm';

export type TipoEventoCobranza = 'contacto' | 'nota' | 'promesa';
export type CanalContacto = 'llamada' | 'whatsapp' | 'correo' | 'presencial' | 'otro';
export type EstadoPromesa = 'pendiente' | 'cumplida' | 'incumplida';

export const CANALES: CanalContacto[] = ['llamada', 'whatsapp', 'correo', 'presencial', 'otro'];

export interface EventoCobranza {
  id:            number;
  tipo:          TipoEventoCobranza;
  fecha:         string;
  canal:         CanalContacto | null;
  comentario:    string | null;
  promesaFecha:  string | null;
  promesaMonto:  number | null;
  promesaEstado: EstadoPromesa | null;
  usuario:       string | null;
  createdAt:     string;
}

export interface SeguimientoCuenta {
  responsableUserId:  number | null;
  responsableNombre:  string | null;
  proximaAccion:      string | null;
  proximaAccionFecha: string | null;
  actualizadoPor:     string | null;
  actualizadoEn:      string | null;
}

export interface GestionCuenta {
  eventos:       EventoCobranza[];
  seguimiento:   SeguimientoCuenta | null;
  /** Fecha del último contacto registrado (tipo='contacto'). */
  ultimoContacto: string | null;
  /** Promesa vigente: la más reciente en estado 'pendiente'. */
  promesaActiva:  EventoCobranza | null;
}

/** Trae el log y el estado de una cuenta. */
export async function getGestionCuenta(teamId: number, docId: number): Promise<GestionCuenta> {
  const [eventosRaw, segRaw] = await Promise.all([
    db.execute(sql`
      SELECT e.id, e.tipo, to_char(e.fecha, 'YYYY-MM-DD') AS fecha, e.canal, e.comentario,
             to_char(e.promesa_fecha, 'YYYY-MM-DD') AS promesa_fecha,
             e.promesa_monto_cents, e.promesa_estado,
             u.name AS usuario,
             to_char(e.created_at, 'YYYY-MM-DD"T"HH24:MI:SS') AS created_at
      FROM cobranza_eventos e
      LEFT JOIN users u ON u.id = e.created_by
      WHERE e.team_id = ${teamId} AND e.ecf_document_id = ${docId}
      ORDER BY e.fecha DESC, e.id DESC
    `),
    db.execute(sql`
      SELECT s.responsable_user_id, r.name AS responsable_nombre,
             s.proxima_accion,
             to_char(s.proxima_accion_fecha, 'YYYY-MM-DD') AS proxima_accion_fecha,
             a.name AS actualizado_por,
             to_char(s.updated_at, 'YYYY-MM-DD') AS actualizado_en
      FROM cobranza_seguimiento s
      LEFT JOIN users r ON r.id = s.responsable_user_id
      LEFT JOIN users a ON a.id = s.updated_by
      WHERE s.team_id = ${teamId} AND s.ecf_document_id = ${docId}
    `),
  ]);

  const eventos: EventoCobranza[] = (eventosRaw as unknown as Array<Record<string, string | number | null>>)
    .map(e => ({
      id:            Number(e.id),
      tipo:          e.tipo as TipoEventoCobranza,
      fecha:         String(e.fecha),
      canal:         (e.canal as CanalContacto) ?? null,
      comentario:    (e.comentario as string) ?? null,
      promesaFecha:  (e.promesa_fecha as string) ?? null,
      promesaMonto:  e.promesa_monto_cents == null ? null : Number(e.promesa_monto_cents),
      promesaEstado: (e.promesa_estado as EstadoPromesa) ?? null,
      usuario:       (e.usuario as string) ?? null,
      createdAt:     String(e.created_at),
    }));

  const s = (segRaw as unknown as Array<Record<string, string | number | null>>)[0];

  return {
    eventos,
    seguimiento: s
      ? {
          responsableUserId:  s.responsable_user_id == null ? null : Number(s.responsable_user_id),
          responsableNombre:  (s.responsable_nombre as string) ?? null,
          proximaAccion:      (s.proxima_accion as string) ?? null,
          proximaAccionFecha: (s.proxima_accion_fecha as string) ?? null,
          actualizadoPor:     (s.actualizado_por as string) ?? null,
          actualizadoEn:      (s.actualizado_en as string) ?? null,
        }
      : null,
    ultimoContacto: eventos.find(e => e.tipo === 'contacto')?.fecha ?? null,
    promesaActiva:  eventos.find(e => e.tipo === 'promesa' && e.promesaEstado === 'pendiente') ?? null,
  };
}

/** Registra un evento. Devuelve el id creado. */
export async function registrarEvento(args: {
  teamId: number;
  docId: number;
  userId: number;
  tipo: TipoEventoCobranza;
  fecha: string;
  canal?: CanalContacto | null;
  comentario?: string | null;
  promesaFecha?: string | null;
  promesaMontoCents?: number | null;
}): Promise<number> {
  // Una promesa nueva nace 'pendiente'; el CHECK de la tabla exige que las
  // promesas lleven fecha y estado, así que se fija aquí y no en la ruta.
  const promesaEstado = args.tipo === 'promesa' ? 'pendiente' : null;

  const r = await db.execute(sql`
    INSERT INTO cobranza_eventos (
      team_id, ecf_document_id, tipo, fecha, canal, comentario,
      promesa_fecha, promesa_monto_cents, promesa_estado, created_by
    ) VALUES (
      ${args.teamId}, ${args.docId}, ${args.tipo}, ${args.fecha}::date,
      ${args.tipo === 'contacto' ? (args.canal ?? null) : null},
      ${args.comentario ?? null},
      ${args.tipo === 'promesa' ? (args.promesaFecha ?? null) : null}::date,
      ${args.tipo === 'promesa' ? (args.promesaMontoCents ?? null) : null},
      ${promesaEstado}, ${args.userId}
    ) RETURNING id
  `) as unknown as Array<{ id: number }>;

  return Number(r[0].id);
}

/** Marca una promesa como cumplida o incumplida. */
export async function cerrarPromesa(
  teamId: number, eventoId: number, estado: 'cumplida' | 'incumplida',
): Promise<boolean> {
  const r = await db.execute(sql`
    UPDATE cobranza_eventos
    SET promesa_estado = ${estado}
    WHERE id = ${eventoId} AND team_id = ${teamId} AND tipo = 'promesa'
    RETURNING id
  `) as unknown as Array<{ id: number }>;
  return r.length > 0;
}

/** Crea o actualiza el estado de seguimiento de una cuenta. */
export async function guardarSeguimiento(args: {
  teamId: number;
  docId: number;
  userId: number;
  responsableUserId?: number | null;
  proximaAccion?: string | null;
  proximaAccionFecha?: string | null;
}): Promise<void> {
  await db.execute(sql`
    INSERT INTO cobranza_seguimiento (
      ecf_document_id, team_id, responsable_user_id,
      proxima_accion, proxima_accion_fecha, updated_by, updated_at
    ) VALUES (
      ${args.docId}, ${args.teamId}, ${args.responsableUserId ?? null},
      ${args.proximaAccion ?? null}, ${args.proximaAccionFecha ?? null}::date,
      ${args.userId}, now()
    )
    ON CONFLICT (ecf_document_id) DO UPDATE SET
      responsable_user_id  = EXCLUDED.responsable_user_id,
      proxima_accion       = EXCLUDED.proxima_accion,
      proxima_accion_fecha = EXCLUDED.proxima_accion_fecha,
      updated_by           = EXCLUDED.updated_by,
      updated_at           = now()
  `);
}

/**
 * Marca como incumplidas las promesas cuya fecha ya pasó y que no fueron
 * saldadas. "Saldada" = la factura quedó en PAGADA, o entró un pago por al
 * menos el monto prometido desde que se hizo la promesa.
 *
 * Idempotente: solo toca las que siguen en 'pendiente'.
 */
export async function evaluarPromesasVencidas(teamId: number): Promise<{
  cumplidas: number; incumplidas: number;
}> {
  // Cumplidas primero: si el pago llegó, no debe marcarse incumplida aunque la
  // fecha ya haya pasado.
  const cumplidas = await db.execute(sql`
    UPDATE cobranza_eventos e
    SET promesa_estado = 'cumplida'
    WHERE e.team_id = ${teamId}
      AND e.tipo = 'promesa'
      AND e.promesa_estado = 'pendiente'
      AND (
        -- La factura quedó saldada: la promesa se cumplió, sin importar el monto.
        EXISTS (
          SELECT 1 FROM ecf_documents d
          WHERE d.id = e.ecf_document_id AND d.estado_pago = 'PAGADA'
        )
        OR (
          -- O entró al menos lo prometido desde que se hizo la promesa.
          -- Sin monto prometido esta rama no aplica (no hay contra qué medir).
          coalesce(e.promesa_monto_cents, 0) > 0
          AND coalesce((
            SELECT SUM(p.monto_centavos) FROM pagos_recibidos p
            WHERE p.ecf_document_id = e.ecf_document_id
              AND p.fecha_pago >= e.fecha
          ), 0) >= e.promesa_monto_cents
        )
      )
    RETURNING e.id
  `) as unknown as Array<{ id: number }>;

  const incumplidas = await db.execute(sql`
    UPDATE cobranza_eventos e
    SET promesa_estado = 'incumplida'
    WHERE e.team_id = ${teamId}
      AND e.tipo = 'promesa'
      AND e.promesa_estado = 'pendiente'
      AND e.promesa_fecha < (now() AT TIME ZONE 'America/Santo_Domingo')::date
    RETURNING e.id
  `) as unknown as Array<{ id: number }>;

  return { cumplidas: cumplidas.length, incumplidas: incumplidas.length };
}

/** Métricas de promesas para las tarjetas de la cartera. */
export async function getMetricasPromesas(teamId: number): Promise<{
  pendientes: number; incumplidas: number; montoPendiente: number;
}> {
  const [r] = await db.execute(sql`
    SELECT
      COUNT(*) FILTER (WHERE promesa_estado = 'pendiente')   AS pendientes,
      COUNT(*) FILTER (WHERE promesa_estado = 'incumplida')  AS incumplidas,
      coalesce(SUM(promesa_monto_cents) FILTER (WHERE promesa_estado = 'pendiente'), 0) AS monto_pendiente
    FROM cobranza_eventos
    WHERE team_id = ${teamId} AND tipo = 'promesa'
  `) as unknown as Array<Record<string, string>>;

  return {
    pendientes:     Number(r?.pendientes ?? 0),
    incumplidas:    Number(r?.incumplidas ?? 0),
    montoPendiente: Number(r?.monto_pendiente ?? 0),
  };
}
