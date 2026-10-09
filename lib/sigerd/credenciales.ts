/**
 * Credenciales de SIGERD guardadas por colegio.
 *
 * Todo lo que toca la contraseña pasa por aquí, y por ningún otro sitio. El
 * objetivo es que en el resto del código sea imposible escribirla en un log,
 * devolverla por una API o meterla en un mensaje de error sin darse cuenta.
 *
 * Tres reglas que sostienen eso:
 *
 *  1. `leerCredenciales` NO devuelve la contraseña. Devuelve lo que se puede
 *     enseñar: el usuario, el centro, cuándo se verificó. Para usarla de verdad
 *     está `conSesion`, que la descifra, la usa y la deja morir en el ámbito de
 *     la función.
 *  2. Los errores del portal se recortan y se guardan en `ultimoError` sin el
 *     cuerpo de la respuesta: el HTML del login puede traer el usuario dentro.
 *  3. Nada aquí hace `console.log` de un objeto de credenciales.
 *
 * @see lib/sigerd/sesion-cookie.ts — la sesión efímera del usuario que navega,
 *      que sigue sin persistir nada. Esto es para los procesos desatendidos.
 */

import 'server-only';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { sigerdCredenciales } from '@/lib/db/schema';
import { encryptField, decryptField } from '@/lib/crypto/cert';

/** Lo que se puede enseñar de unas credenciales. Nunca la contraseña. */
export interface CredencialesVisibles {
  usuario: string;
  idCentro: number | null;
  centroNombre: string | null;
  verificadoEn: Date | null;
  ultimoError: string | null;
}

/**
 * Guarda o reemplaza las credenciales del colegio.
 *
 * `verificadoEn` se pone en nulo a propósito: unas credenciales recién escritas
 * todavía no las ha aceptado el portal, y decir que sí antes de probarlas haría
 * que la pantalla enseñara "conectado" para una contraseña equivocada.
 */
export async function guardarCredenciales(
  teamId: number,
  usuario: string,
  clave: string,
  centro?: { idCentro: number | null; nombre: string | null },
): Promise<void> {
  const cifrada = encryptField(clave);
  const fila = {
    teamId,
    usuario: usuario.trim(),
    claveCifrada: cifrada.ciphered,
    claveIv: cifrada.iv,
    claveTag: cifrada.authTag,
    idCentro: centro?.idCentro ?? null,
    centroNombre: centro?.nombre ?? null,
    verificadoEn: null,
    ultimoError: null,
    updatedAt: new Date(),
  };

  await db.insert(sigerdCredenciales).values(fila)
    .onConflictDoUpdate({ target: sigerdCredenciales.teamId, set: fila });
}

/** Lo guardado, sin la contraseña. `null` si el colegio no ha puesto ninguna. */
export async function leerCredenciales(teamId: number): Promise<CredencialesVisibles | null> {
  const [row] = await db
    .select({
      usuario: sigerdCredenciales.usuario,
      idCentro: sigerdCredenciales.idCentro,
      centroNombre: sigerdCredenciales.centroNombre,
      verificadoEn: sigerdCredenciales.verificadoEn,
      ultimoError: sigerdCredenciales.ultimoError,
    })
    .from(sigerdCredenciales)
    .where(eq(sigerdCredenciales.teamId, teamId))
    .limit(1);
  return row ?? null;
}

/** Las borra. Lo que ya se importó se queda; solo se pierde el poder reconectar. */
export async function olvidarCredenciales(teamId: number): Promise<boolean> {
  const [row] = await db.delete(sigerdCredenciales)
    .where(eq(sigerdCredenciales.teamId, teamId))
    .returning({ id: sigerdCredenciales.id });
  return row != null;
}

/**
 * Usa la contraseña sin devolverla.
 *
 * Es la ÚNICA puerta por la que sale en claro, y solo hacia dentro: el llamador
 * recibe usuario y clave como argumentos de su propia función y no puede
 * quedarse con ellos más allá de esa llamada. Si esto devolviera la contraseña,
 * tarde o temprano alguien la metería en un objeto que acaba en un log.
 *
 * Devuelve `null` si el colegio no tiene credenciales guardadas, para que el
 * llamador distinga "no configurado" de "falló el portal".
 */
export async function conCredenciales<T>(
  teamId: number,
  fn: (usuario: string, clave: string, centro: { idCentro: number | null; nombre: string | null }) => Promise<T>,
): Promise<T | null> {
  const [row] = await db.select().from(sigerdCredenciales)
    .where(eq(sigerdCredenciales.teamId, teamId))
    .limit(1);
  if (!row) return null;

  const clave = decryptField({
    ciphered: row.claveCifrada,
    iv: row.claveIv,
    authTag: row.claveTag,
  });

  return fn(row.usuario, clave, { idCentro: row.idCentro, nombre: row.centroNombre });
}

/**
 * Anota que el portal las aceptó. Limpia el último error.
 */
export async function marcarVerificadas(
  teamId: number,
  centro?: { idCentro: number | null; nombre: string | null },
): Promise<void> {
  await db.update(sigerdCredenciales)
    .set({
      verificadoEn: new Date(),
      ultimoError: null,
      ...(centro ? { idCentro: centro.idCentro, centroNombre: centro.nombre } : {}),
      updatedAt: new Date(),
    })
    .where(eq(sigerdCredenciales.teamId, teamId));
}

/**
 * Anota por qué falló el último intento.
 *
 * Se recorta a 300 caracteres y se espera un mensaje ya redactado, no el cuerpo
 * de la respuesta: el HTML del login del portal trae el usuario dentro, y esto
 * se enseña en pantalla.
 */
export async function marcarFallo(teamId: number, motivo: string): Promise<void> {
  await db.update(sigerdCredenciales)
    .set({ ultimoError: motivo.slice(0, 300), updatedAt: new Date() })
    .where(and(eq(sigerdCredenciales.teamId, teamId)));
}
