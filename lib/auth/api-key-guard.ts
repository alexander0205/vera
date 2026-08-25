// lib/auth/api-key-guard.ts
import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { apiKeys } from '@/lib/db/schema';

const PERMISOS_CON_LECTURA = ['read', 'write', 'admin'];

/** Puro: dado el valor de `permisos` de una key, ¿alcanza para leer? */
export function permiteLectura(permisos: string): boolean {
  return PERMISOS_CON_LECTURA.includes(permisos);
}

const MENSAJE_401 = 'API key inválida o sin permiso de lectura';

function rechazo() {
  return { ok: false as const, response: NextResponse.json({ error: MENSAJE_401 }, { status: 401 }) };
}

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

  const keyPrefix = rawKey.slice(0, 12);

  const [fila] = await db
    .select()
    .from(apiKeys)
    .where(eq(apiKeys.keyPrefix, keyPrefix))
    .limit(1);

  if (!fila) return rechazo();
  if (fila.revokedAt) return rechazo();
  if (fila.expiresAt && fila.expiresAt.getTime() < Date.now()) return rechazo();
  if (!permiteLectura(fila.permisos)) return rechazo();

  const coincide = await bcrypt.compare(rawKey, fila.keyHash);
  if (!coincide) return rechazo();

  // Fire-and-forget: no bloquear la respuesta por esto.
  void db.update(apiKeys).set({ ultimoUsoAt: new Date() })
    .where(eq(apiKeys.id, fila.id)).catch(() => {});

  return { ok: true, teamId: fila.teamId, apiKeyId: fila.id };
}
