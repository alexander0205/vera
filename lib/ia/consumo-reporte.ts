import 'server-only';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';

export { rangoDelMes } from './consumo';

/**
 * Cuánto gastó la IA, para /admin/ia: por empresa en un mes y, de una empresa,
 * por conversación. Sale de `ia_consumo` (migración 0208).
 */

export interface ConsumoEmpresa {
  teamId: number | null;
  empresa: string;
  conversaciones: number;
  mensajes: number;
  tokensEntrada: number;
  tokensSalida: number;
  costoUsd: number;
  /** De ese costo, lo de Jev (decisiones). */
  costoJevUsd: number;
  modelos: string[];
  /** Respuestas del chat en el mes: las del automático no gastan IA. */
  respuestasAutomaticas: number;
  respuestasIa: number;
  /** De las de IA, cuántas fueron de análisis (Claude). */
  respuestasAnalisis: number;
  /** Personas distintas que usaron el chat. */
  usuarios: number;
}

export interface ConsumoModelo {
  modelo: string;
  proveedor: string;
  respuestas: number;
  llamadas: number;
  tokensEntrada: number;
  tokensSalida: number;
  costoUsd: number;
}

export interface ConsumoConversacion {
  conversacionId: number | null;
  titulo: string;
  usuario: string;
  mensajes: number;
  tokensEntrada: number;
  tokensSalida: number;
  costoUsd: number;
  ultima: string;
}

const num = (v: unknown) => Number(v) || 0;

export async function consumoPorEmpresa(desde: Date, hasta: Date): Promise<ConsumoEmpresa[]> {
  const d = desde.toISOString();
  const h = hasta.toISOString();
  // El gasto sale de ia_consumo; el uso (respuestas del automático, personas),
  // de los mensajes del chat: una empresa que solo usa el automático no gasta,
  // pero usa el chat y debe salir.
  const filas = await db.execute<Record<string, unknown>>(sql`
    WITH gasto AS (
      SELECT c.team_id,
             COUNT(DISTINCT c.conversacion_id) AS conversaciones,
             COUNT(DISTINCT c.mensaje_id) AS mensajes,
             SUM(c.tokens_entrada) AS entrada, SUM(c.tokens_salida) AS salida,
             SUM(c.costo_usd) AS costo,
             COALESCE(SUM(c.costo_usd) FILTER (WHERE c.uso = 'decisiones'), 0) AS costo_jev,
             COUNT(DISTINCT c.mensaje_id) FILTER (WHERE c.nivel = 'analisis') AS analisis,
             ARRAY_AGG(DISTINCT c.modelo) AS modelos
        FROM ia_consumo c
       WHERE c.creado_en >= ${d} AND c.creado_en < ${h}
       GROUP BY c.team_id
    ), uso AS (
      SELECT ac.team_id,
             COUNT(*) FILTER (WHERE m.origen = 'local') AS automaticas,
             COUNT(*) FILTER (WHERE m.origen = 'ia') AS ia,
             COUNT(DISTINCT ac.user_id) AS usuarios,
             COUNT(DISTINCT ac.id) AS conversaciones
        FROM asistente_mensajes m
        JOIN asistente_conversaciones ac ON ac.id = m.conversacion_id
       WHERE m.rol = 'assistant' AND m.creado_en >= ${d} AND m.creado_en < ${h}
       GROUP BY ac.team_id
    )
    SELECT COALESCE(g.team_id, u.team_id) AS team_id, t.name AS empresa,
           GREATEST(COALESCE(g.conversaciones, 0), COALESCE(u.conversaciones, 0)) AS conversaciones,
           COALESCE(g.mensajes, 0) AS mensajes,
           COALESCE(g.entrada, 0) AS entrada, COALESCE(g.salida, 0) AS salida,
           COALESCE(g.costo, 0) AS costo, COALESCE(g.costo_jev, 0) AS costo_jev,
           COALESCE(g.analisis, 0) AS analisis, COALESCE(g.modelos, ARRAY[]::varchar[]) AS modelos,
           COALESCE(u.automaticas, 0) AS automaticas, COALESCE(u.ia, 0) AS ia, COALESCE(u.usuarios, 0) AS usuarios
      FROM gasto g
      FULL OUTER JOIN uso u ON u.team_id = g.team_id
      LEFT JOIN teams t ON t.id = COALESCE(g.team_id, u.team_id)
     ORDER BY COALESCE(g.costo, 0) DESC, COALESCE(u.ia, 0) + COALESCE(u.automaticas, 0) DESC`);
  return filas.map((f) => ({
    teamId: f.team_id == null ? null : num(f.team_id),
    empresa: f.empresa ? String(f.empresa) : f.team_id == null ? 'Plataforma' : `Empresa ${f.team_id}`,
    conversaciones: num(f.conversaciones),
    mensajes: num(f.mensajes),
    tokensEntrada: num(f.entrada),
    tokensSalida: num(f.salida),
    costoUsd: num(f.costo),
    costoJevUsd: num(f.costo_jev),
    modelos: Array.isArray(f.modelos) ? f.modelos.map(String) : [],
    respuestasAutomaticas: num(f.automaticas),
    respuestasIa: num(f.ia),
    respuestasAnalisis: num(f.analisis),
    usuarios: num(f.usuarios),
  }));
}

/** Lo gastado en el mes por modelo: qué modelo contesta y cuánto cuesta cada uno. */
export async function consumoPorModelo(desde: Date, hasta: Date): Promise<ConsumoModelo[]> {
  const filas = await db.execute<Record<string, unknown>>(sql`
    SELECT c.modelo, MIN(c.proveedor) AS proveedor,
           COUNT(DISTINCT c.mensaje_id) AS respuestas, COUNT(*) AS llamadas,
           SUM(c.tokens_entrada) AS entrada, SUM(c.tokens_salida) AS salida, SUM(c.costo_usd) AS costo
      FROM ia_consumo c
     WHERE c.creado_en >= ${desde.toISOString()} AND c.creado_en < ${hasta.toISOString()}
     GROUP BY c.modelo
     ORDER BY SUM(c.costo_usd) DESC`);
  return filas.map((f) => ({
    modelo: String(f.modelo),
    proveedor: String(f.proveedor ?? ''),
    respuestas: num(f.respuestas),
    llamadas: num(f.llamadas),
    tokensEntrada: num(f.entrada),
    tokensSalida: num(f.salida),
    costoUsd: num(f.costo),
  }));
}

export async function consumoPorConversacion(teamId: number, desde: Date, hasta: Date): Promise<ConsumoConversacion[]> {
  const filas = await db.execute<Record<string, unknown>>(sql`
    SELECT c.conversacion_id, ac.titulo, COALESCE(u.name, u.email) AS usuario,
           COUNT(DISTINCT c.mensaje_id) AS mensajes,
           SUM(c.tokens_entrada) AS entrada, SUM(c.tokens_salida) AS salida,
           SUM(c.costo_usd) AS costo, MAX(c.creado_en) AS ultima
      FROM ia_consumo c
      LEFT JOIN asistente_conversaciones ac ON ac.id = c.conversacion_id
      LEFT JOIN users u ON u.id = c.user_id
     WHERE c.team_id = ${teamId}
       AND c.creado_en >= ${desde.toISOString()} AND c.creado_en < ${hasta.toISOString()}
     GROUP BY c.conversacion_id, ac.titulo, u.name, u.email
     ORDER BY MAX(c.creado_en) DESC
     LIMIT 200`);
  return filas.map((f) => ({
    conversacionId: f.conversacion_id == null ? null : num(f.conversacion_id),
    titulo: f.titulo ? String(f.titulo) : '(sin título)',
    usuario: f.usuario ? String(f.usuario) : '—',
    mensajes: num(f.mensajes),
    tokensEntrada: num(f.entrada),
    tokensSalida: num(f.salida),
    costoUsd: num(f.costo),
    ultima: f.ultima instanceof Date ? f.ultima.toISOString() : String(f.ultima ?? ''),
  }));
}
