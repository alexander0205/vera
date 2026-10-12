// lib/auth/api-key-guard.ts
import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { apiKeys } from '@/lib/db/schema';
import { rateLimit, rateLimitDb } from '@/lib/rate-limit';

const PERMISOS_CON_LECTURA = ['read', 'write', 'admin'];

/**
 * Dos topes, porque son dos abusos distintos.
 *
 * POR IP, y ANTES del bcrypt. Abajo, cuando el prefijo no existe, se gasta un
 * bcrypt señuelo a propósito para que tarde lo mismo que uno que sí existe —
 * es la defensa contra el ataque de tiempo y está bien. Pero son ~140 ms de
 * CPU medidos, y los paga cualquiera que mande `Bearer emdo_loquesea`, SIN
 * credenciales. Sin este tope, un bucle contra la ruta factura CPU en Vercel
 * indefinidamente. Va en memoria a propósito: el objetivo es no hacer trabajo,
 * y consultar la base para decidir si trabajar ya es trabajo.
 *
 * POR KEY, y después de validarla. Este sí va a la base: una key legítima
 * puede pedir `list_invoices?limit=500` en bucle desde donde quiera, y ahí el
 * tope tiene que valer entre instancias o no vale. Una conversación con el MCP
 * son unas pocas llamadas; 300 por minuto es holgado para el uso real y
 * acota el costo igual.
 */
const MAX_POR_IP = 120;
const MAX_POR_KEY = 300;
const VENTANA_MS = 60_000;

/** IP del cliente. En Vercel la cabecera la pone la plataforma, no el que llama. */
function ipDe(req: NextRequest): string {
  const xff = req.headers.get('x-forwarded-for');
  return xff?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || 'desconocida';
}

function demasiadas(resetMs: number) {
  const segundos = Math.max(1, Math.ceil((resetMs - Date.now()) / 1000));
  return {
    ok: false as const,
    response: NextResponse.json(
      { error: 'Demasiadas peticiones. Reintentá en un momento.' },
      { status: 429, headers: { 'Retry-After': String(segundos) } },
    ),
  };
}

/** Puro: dado el valor de `permisos` de una key, ¿alcanza para leer? */
export function permiteLectura(permisos: string): boolean {
  return PERMISOS_CON_LECTURA.includes(permisos);
}

const MENSAJE_401 = 'API key inválida o sin permiso de lectura';

function rechazo() {
  return { ok: false as const, response: NextResponse.json({ error: MENSAJE_401 }, { status: 401 }) };
}

/**
 * Hash de una cadena que no es la key de nadie. Sirve para gastar el mismo
 * bcrypt cuando el prefijo no existe.
 *
 * Sin esto el tiempo de respuesta delataba qué prefijos están en uso: si no
 * había fila, se contestaba sin llegar a bcrypt (~370 ms medidos) y si la
 * había, se pagaban los ~140 ms del hash (~520 ms). Esa diferencia es limpia y
 * repetible, así que un prefijo se puede confirmar cronometrando. No abre la
 * puerta por sí sola —siguen faltando los 41 caracteres del resto— pero es un
 * oráculo gratis y no hay motivo para regalarlo.
 */
const HASH_SEÑUELO = '$2b$10$adzriEnv.qkvSSaP4UzpGepce7sseSnxUMIbK.s4OPDebj.J8a3/O';

export type ApiKeyAuthOk = { ok: true; teamId: number; apiKeyId: number };
export type ApiKeyAuthErr = { ok: false; response: NextResponse };

/**
 * Valida `Authorization: Bearer emdo_xxx` contra `apiKeys`. Mismo mensaje de
 * error para key ausente, mal formada, inexistente, revocada, expirada o sin
 * permiso de lectura — no delatar cuál caso fue para no ayudar a adivinar keys.
 */
export async function requireApiKey(req: NextRequest): Promise<ApiKeyAuthOk | ApiKeyAuthErr> {
  const header = req.headers.get('authorization') ?? '';
  if (!header.startsWith('Bearer ')) return rechazo();
  const rawKey = header.slice('Bearer '.length).trim();
  if (!rawKey.startsWith('emdo_')) return rechazo();

  // Antes de la consulta y del bcrypt: pasado el tope, la petición no cuesta
  // más que leer un Map.
  const porIp = rateLimit(`mcp_ip:${ipDe(req)}`, MAX_POR_IP, VENTANA_MS);
  if (!porIp.allowed) return demasiadas(porIp.reset);

  const keyPrefix = rawKey.slice(0, 12);

  /**
   * TODAS las filas del prefijo, no la primera.
   *
   * El prefijo son 7 caracteres hex —268 millones de combinaciones— y la tabla
   * no tiene UNIQUE sobre él, así que dos keys pueden compartirlo: con ~19.000
   * keys la probabilidad ronda el 50%. Con `.limit(1)` la consulta devolvía UNA
   * fila cualquiera (sin ORDER BY, la que Postgres tuviera a mano), bcrypt
   * fallaba contra la otra y la key legítima quedaba rechazada para siempre,
   * sin nada en el error que explicara por qué.
   *
   * Son una o dos filas: comparar todas no cuesta nada y quita el problema de
   * raíz sin migración.
   */
  const filas = await db
    .select()
    .from(apiKeys)
    .where(eq(apiKeys.keyPrefix, keyPrefix));

  for (const fila of filas) {
    const coincide = await bcrypt.compare(rawKey, fila.keyHash);
    if (!coincide) continue;

    // Ya sabemos que la key es de esta fila: recién ahora se mira su estado.
    if (fila.revokedAt) return rechazo();
    if (fila.expiresAt && fila.expiresAt.getTime() < Date.now()) return rechazo();
    if (!permiteLectura(fila.permisos)) return rechazo();

    // Tope por key. Va contra la base porque tiene que valer entre instancias:
    // el mismo cliente puede caer en cualquiera y el tope en memoria se
    // multiplicaría por el número de instancias vivas.
    const porKey = await rateLimitDb(`mcp_key:${fila.id}`, MAX_POR_KEY, VENTANA_MS);
    if (!porKey.allowed) return demasiadas(porKey.resetAt.getTime());

    // Fire-and-forget: no bloquear la respuesta por esto.
    void db.update(apiKeys).set({ ultimoUsoAt: new Date() })
      .where(eq(apiKeys.id, fila.id)).catch(() => {});

    return { ok: true, teamId: fila.teamId, apiKeyId: fila.id };
  }

  // Ninguna fila coincidió. Si tampoco había ninguna, se gasta igual un bcrypt
  // para que el prefijo inexistente tarde lo mismo que el existente.
  if (filas.length === 0) await bcrypt.compare(rawKey, HASH_SEÑUELO);
  return rechazo();
}
