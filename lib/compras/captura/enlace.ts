import 'server-only';
import { and, eq, isNull } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { capturaFacturasEnlaces } from '@/lib/db/schema';
import { generarToken, hashToken, formatoTokenValido } from '@/lib/fotos/sesiones';
import { encryptField, decryptField } from '@/lib/crypto/cert';

/**
 * El enlace con que se fotografían facturas de proveedor. Uno vivo por empresa.
 *
 * No vence: se comparte por WhatsApp con el mensajero, el contable o quien
 * compre, y tiene que seguir sirviendo el mes que viene. Por eso se puede
 * regenerar (el anterior deja de abrir) y desactivar.
 *
 * Se guarda el SHA-256 del token para encontrarlo y el token CIFRADO para
 * volver a enseñarlo en la pantalla: a diferencia de un enlace de un solo uso,
 * este se copia muchas veces. Quien lea la tabla sin CERT_MASTER_KEY no puede
 * reconstruirlo. Mismo generador y formato que los enlaces de fotos y
 * documentos (256 bits).
 */

const cifrar = (token: string) => {
  const e = encryptField(token);
  return `${e.iv}:${e.authTag}:${e.ciphered}`;
};

function descifrar(guardado: string | null): string | null {
  if (!guardado) return null;
  const [iv, authTag, ciphered] = guardado.split(':');
  try {
    return decryptField({ iv, authTag, ciphered });
  } catch {
    // Cambió la llave maestra: el enlace sigue abriendo, pero ya no se puede
    // enseñar. La pantalla ofrece regenerarlo.
    return null;
  }
}

export interface EnlaceVivo {
  id: number;
  /** null si no se pudo descifrar: hay que regenerarlo para volver a copiarlo. */
  token: string | null;
  creadoEn: Date;
  ultimoUsoEn: Date | null;
}

export async function enlaceVivo(teamId: number): Promise<EnlaceVivo | null> {
  const [fila] = await db
    .select()
    .from(capturaFacturasEnlaces)
    .where(and(eq(capturaFacturasEnlaces.teamId, teamId), isNull(capturaFacturasEnlaces.revocadoEn)))
    .limit(1);
  if (!fila) return null;
  return { id: fila.id, token: descifrar(fila.tokenCifrado), creadoEn: fila.creadoEn, ultimoUsoEn: fila.ultimoUsoEn };
}

/** Crea el enlace de la empresa, desactivando el que hubiera. */
export async function crearEnlace(teamId: number, userId: number | null): Promise<string> {
  const token = generarToken();
  await db.transaction(async (tx) => {
    await tx.update(capturaFacturasEnlaces)
      .set({ revocadoEn: new Date() })
      .where(and(eq(capturaFacturasEnlaces.teamId, teamId), isNull(capturaFacturasEnlaces.revocadoEn)));
    await tx.insert(capturaFacturasEnlaces).values({
      teamId, tokenHash: hashToken(token), tokenCifrado: cifrar(token), creadoPor: userId,
    });
  });
  return token;
}

export async function desactivarEnlace(teamId: number): Promise<boolean> {
  const filas = await db.update(capturaFacturasEnlaces)
    .set({ revocadoEn: new Date() })
    .where(and(eq(capturaFacturasEnlaces.teamId, teamId), isNull(capturaFacturasEnlaces.revocadoEn)))
    .returning({ id: capturaFacturasEnlaces.id });
  return filas.length > 0;
}

/**
 * El enlace de un token, si sigue vivo. Un token mal formado, desconocido o
 * revocado dan lo mismo: desde fuera no se distingue si llegó a existir.
 */
export async function resolverEnlace(token: string): Promise<{ id: number; teamId: number } | null> {
  if (!formatoTokenValido(token)) return null;
  const [fila] = await db
    .select({ id: capturaFacturasEnlaces.id, teamId: capturaFacturasEnlaces.teamId, revocadoEn: capturaFacturasEnlaces.revocadoEn })
    .from(capturaFacturasEnlaces)
    .where(eq(capturaFacturasEnlaces.tokenHash, hashToken(token)))
    .limit(1);
  if (!fila || fila.revocadoEn) return null;
  return { id: fila.id, teamId: fila.teamId };
}

export async function marcarUso(enlaceId: number): Promise<void> {
  await db.update(capturaFacturasEnlaces).set({ ultimoUsoEn: new Date() }).where(eq(capturaFacturasEnlaces.id, enlaceId));
}
