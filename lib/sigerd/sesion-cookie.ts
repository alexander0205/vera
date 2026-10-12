/**
 * Sesión SIGERD efímera, guardada en una cookie httpOnly **cifrada** (JWE).
 *
 * Decisión de diseño: NO se persiste la contraseña del usuario en ningún lado.
 * Lo único que sobrevive entre peticiones son las cookies que el portal del
 * MINERD emitió, cifradas con AES-256-GCM dentro de un JWE que además caduca
 * solo. Si hay una brecha de base de datos no hay nada que robar, porque no
 * tocamos la base de datos.
 *
 * Dos cookies distintas:
 *   `sigerd_pendiente` — login a medias, esperando que el usuario elija perfil.
 *                        Vive 5 minutos. Guarda jar + token + usuario + perfiles.
 *   `sigerd_sesion`    — sesión ya autenticada. Vive `TTL_SESION_MIN` minutos,
 *                        alineado con el timeout de sesión de ASP.NET.
 *
 * Clave de cifrado, en orden de preferencia:
 *   SIGERD_SESSION_KEY (64 hex) → CERT_MASTER_KEY (64 hex) → SHA-256(AUTH_SECRET)
 */

import { createHash } from 'crypto';
import { EncryptJWT, jwtDecrypt } from 'jose';
import { cookies } from 'next/headers';
import type { SigerdPerfil, SigerdSesion } from './types';

const COOKIE_SESION = 'sigerd_sesion';
const COOKIE_PENDIENTE = 'sigerd_pendiente';

const TTL_SESION_MIN = Number(process.env.SIGERD_TTL_MIN ?? 30);
const TTL_PENDIENTE_MIN = 5;

/** Límite práctico de una cookie (4 KB) con margen para atributos. */
const MAX_BYTES_COOKIE = 3800;

function claveCifrado(): Uint8Array {
  const hex = process.env.SIGERD_SESSION_KEY ?? process.env.CERT_MASTER_KEY;
  if (hex && /^[0-9a-fA-F]{64}$/.test(hex)) return new Uint8Array(Buffer.from(hex, 'hex'));

  const auth = process.env.AUTH_SECRET;
  if (!auth) {
    throw new Error(
      '[sigerd] Falta clave de cifrado: define SIGERD_SESSION_KEY (64 hex), CERT_MASTER_KEY o AUTH_SECRET.',
    );
  }
  // Deriva 32 bytes deterministas del secreto de sesión ya existente.
  return new Uint8Array(createHash('sha256').update(auth).digest());
}

/** Datos del login a medias: credenciales NO incluidas (las reenvía el navegador). */
export interface SigerdPendiente {
  usuario: string;
  sesion: SigerdSesion;
  perfiles: SigerdPerfil[];
}

async function cifrar(payload: Record<string, unknown>, minutos: number): Promise<string> {
  return await new EncryptJWT(payload)
    .setProtectedHeader({ alg: 'dir', enc: 'A256GCM' })
    .setIssuedAt()
    .setExpirationTime(`${minutos}m`)
    .encrypt(claveCifrado());
}

async function descifrar<T>(token: string): Promise<T | null> {
  try {
    const { payload } = await jwtDecrypt(token, claveCifrado());
    return payload as T;
  } catch {
    // Expirado, manipulado o cifrado con otra clave: se trata como "sin sesión".
    return null;
  }
}

const opcionesCookie = (maxAgeSeg: number) => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/',
  maxAge: maxAgeSeg,
});

function verificarTamano(token: string, cual: string): void {
  if (token.length > MAX_BYTES_COOKIE) {
    throw new Error(
      `[sigerd] La cookie ${cual} pesa ${token.length} B y no cabe en 4 KB. ` +
        'Las cookies del portal crecieron: hay que mover la sesión a una tabla con TTL.',
    );
  }
}

// ───────────────────────────── Sesión abierta ─────────────────────────────

export async function guardarSesion(sesion: SigerdSesion): Promise<void> {
  const token = await cifrar({ sesion }, TTL_SESION_MIN);
  verificarTamano(token, COOKIE_SESION);

  const jar = await cookies();
  jar.set(COOKIE_SESION, token, opcionesCookie(TTL_SESION_MIN * 60));
  jar.delete(COOKIE_PENDIENTE);
}

export async function leerSesion(): Promise<SigerdSesion | null> {
  const token = (await cookies()).get(COOKIE_SESION)?.value;
  if (!token) return null;

  const payload = await descifrar<{ sesion: SigerdSesion }>(token);
  return payload?.sesion ?? null;
}

export async function borrarSesion(): Promise<void> {
  const jar = await cookies();
  jar.delete(COOKIE_SESION);
  jar.delete(COOKIE_PENDIENTE);
}

// ──────────────────────────── Login a medias ──────────────────────────────

export async function guardarPendiente(pendiente: SigerdPendiente): Promise<void> {
  const token = await cifrar({ ...pendiente }, TTL_PENDIENTE_MIN);
  verificarTamano(token, COOKIE_PENDIENTE);

  (await cookies()).set(COOKIE_PENDIENTE, token, opcionesCookie(TTL_PENDIENTE_MIN * 60));
}

export async function leerPendiente(): Promise<SigerdPendiente | null> {
  const token = (await cookies()).get(COOKIE_PENDIENTE)?.value;
  if (!token) return null;

  return await descifrar<SigerdPendiente>(token);
}
