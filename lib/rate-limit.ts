/**
 * Rate limiting en dos sabores:
 *
 * 1. rateLimit()    — in-memory, por proceso.
 *    Rápido, sin overhead de DB. Válido para un solo servidor o dev.
 *    En Vercel (serverless multi-instancia) NO es confiable entre instancias,
 *    pero sigue siendo útil como primera línea de defensa por instancia.
 *    Usado por: login actions.
 *
 * 2. rateLimitDb()  — distribuido, respaldado por Postgres.
 *    Correcto en multi-instancia (Vercel, múltiples réplicas).
 *    Overhead: ~1 query por llamada. Usar en rutas sensibles.
 *    Usado por: cert upload, emitir e-CF.
 */

import { db } from '@/lib/db/drizzle';
import { rateLimits } from '@/lib/db/schema';
import { sql } from 'drizzle-orm';

// ─── In-memory (por proceso) ──────────────────────────────────────────────────

interface RateLimitEntry { count: number; reset: number; }
const store = new Map<string, RateLimitEntry>();

if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of store.entries()) {
      if (entry.reset < now) store.delete(key);
    }
  }, 5 * 60 * 1000);
}

export function rateLimit(
  key: string,
  maxRequests = 10,
  windowMs = 60_000,
): { allowed: boolean; remaining: number; reset: number } {
  const now   = Date.now();
  const entry = store.get(key);

  if (!entry || entry.reset < now) {
    store.set(key, { count: 1, reset: now + windowMs });
    return { allowed: true, remaining: maxRequests - 1, reset: now + windowMs };
  }

  if (entry.count >= maxRequests) {
    return { allowed: false, remaining: 0, reset: entry.reset };
  }

  entry.count++;
  return { allowed: true, remaining: maxRequests - entry.count, reset: entry.reset };
}

// ─── Distribuido (Postgres) ───────────────────────────────────────────────────

/**
 * Rate limiter distribuido basado en Postgres.
 * Usa INSERT ... ON CONFLICT para garantizar atomicidad sin locks explícitos.
 *
 * @param key         Identificador único (ej: `cert_upload:teamId:123`)
 * @param maxRequests Máximo de peticiones permitidas en la ventana
 * @param windowMs    Tamaño de la ventana en milisegundos
 */
export async function rateLimitDb(
  key: string,
  maxRequests = 10,
  windowMs = 60_000,
): Promise<{ allowed: boolean; remaining: number; resetAt: Date }> {
  // Pasar el intervalo como expresión SQL (evita serializar un Date en el template)
  const windowSecs = Math.ceil(windowMs / 1000);

  const rows = await db.execute<{ count: number; reset_at: Date }>(sql`
    INSERT INTO rate_limits (key, count, reset_at)
    VALUES (${key}, 1, NOW() + ${windowSecs} * INTERVAL '1 second')
    ON CONFLICT (key) DO UPDATE
      SET
        count    = CASE
                     WHEN rate_limits.reset_at < NOW() THEN 1
                     ELSE rate_limits.count + 1
                   END,
        reset_at = CASE
                     WHEN rate_limits.reset_at < NOW() THEN NOW() + ${windowSecs} * INTERVAL '1 second'
                     ELSE rate_limits.reset_at
                   END
    RETURNING count, reset_at
  `);

  const row   = rows[0] as { count: number; reset_at: Date };
  const count = Number(row.count);

  return {
    allowed:   count <= maxRequests,
    remaining: Math.max(0, maxRequests - count),
    resetAt:   row.reset_at,
  };
}
