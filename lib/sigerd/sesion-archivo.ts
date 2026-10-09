/**
 * Sesión SIGERD persistida en disco, para las herramientas de línea de comandos.
 *
 * Evita teclear la contraseña en cada corrida. Lo que se guarda son las cookies
 * que emitió el portal — NUNCA la contraseña. Cuando esa sesión caduca, el
 * script vuelve a pedir credenciales.
 *
 * Decisiones de seguridad:
 *  - El archivo vive en `~/.sigerd/`, FUERA del repositorio: así no hay forma
 *    de commitearlo por accidente.
 *  - Permisos `0600` (solo el dueño) tanto en el directorio como en el archivo.
 *  - Contenido cifrado con AES-256-GCM. La clave se genera sola la primera vez
 *    en `~/.sigerd/clave`, también `0600`. Esto no protege contra alguien que ya
 *    tiene tu usuario, pero sí evita que el blob sirva de algo si se copia suelto.
 *  - Caduca a los `TTL_MIN` minutos aunque el portal la aceptara más tiempo.
 *
 * Una sesión guardada es una credencial al portador: quien tenga el archivo y
 * la clave puede actuar como el usuario en SIGERD hasta que expire. Para
 * invalidarla de inmediato: `borrarSesionArchivo()` o el flag `--cerrar`.
 */

import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';
import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import type { SigerdSesion } from './types';

const DIR = join(homedir(), '.sigerd');
const ARCHIVO_SESION = join(DIR, 'sesion.enc');
const ARCHIVO_CLAVE = join(DIR, 'clave');

/** Vida máxima de la sesión guardada. El portal suele cortar antes. */
const TTL_MIN = Number(process.env.SIGERD_TTL_MIN ?? 60);

interface Envoltorio {
  sesion: SigerdSesion;
  expiraEn: number;
  guardadaEn: number;
}

function asegurarDirectorio(): void {
  if (!existsSync(DIR)) mkdirSync(DIR, { recursive: true, mode: 0o700 });
  chmodSync(DIR, 0o700);
}

/** Clave local de la máquina. Se crea sola la primera vez. */
function clave(): Buffer {
  asegurarDirectorio();

  if (!existsSync(ARCHIVO_CLAVE)) {
    writeFileSync(ARCHIVO_CLAVE, randomBytes(32).toString('hex'), { mode: 0o600 });
  }
  chmodSync(ARCHIVO_CLAVE, 0o600);

  return Buffer.from(readFileSync(ARCHIVO_CLAVE, 'utf8').trim(), 'hex');
}

export function guardarSesionArchivo(sesion: SigerdSesion): void {
  asegurarDirectorio();

  const envoltorio: Envoltorio = {
    sesion,
    guardadaEn: Date.now(),
    expiraEn: Date.now() + TTL_MIN * 60_000,
  };

  const iv = randomBytes(16);
  const cipher = createCipheriv('aes-256-gcm', clave(), iv);
  const cifrado = Buffer.concat([cipher.update(JSON.stringify(envoltorio), 'utf8'), cipher.final()]);

  const contenido = JSON.stringify({
    iv: iv.toString('hex'),
    authTag: cipher.getAuthTag().toString('hex'),
    datos: cifrado.toString('base64'),
  });

  writeFileSync(ARCHIVO_SESION, contenido, { mode: 0o600 });
  chmodSync(ARCHIVO_SESION, 0o600);
}

/** Devuelve la sesión guardada, o `null` si no hay, caducó o no se puede descifrar. */
export function leerSesionArchivo(): SigerdSesion | null {
  if (!existsSync(ARCHIVO_SESION)) return null;

  try {
    const { iv, authTag, datos } = JSON.parse(readFileSync(ARCHIVO_SESION, 'utf8'));

    const decipher = createDecipheriv('aes-256-gcm', clave(), Buffer.from(iv, 'hex'));
    decipher.setAuthTag(Buffer.from(authTag, 'hex'));
    const plano = Buffer.concat([decipher.update(Buffer.from(datos, 'base64')), decipher.final()]);

    const envoltorio: Envoltorio = JSON.parse(plano.toString('utf8'));
    if (Date.now() > envoltorio.expiraEn) {
      borrarSesionArchivo();
      return null;
    }

    return envoltorio.sesion;
  } catch {
    // Corrupto, cifrado con otra clave o manipulado: se descarta sin ruido.
    return null;
  }
}

export function borrarSesionArchivo(): void {
  rmSync(ARCHIVO_SESION, { force: true });
}

/** Minutos que le quedan a la sesión guardada. `0` si no hay ninguna válida. */
export function minutosRestantes(): number {
  if (!existsSync(ARCHIVO_SESION)) return 0;

  try {
    const { iv, authTag, datos } = JSON.parse(readFileSync(ARCHIVO_SESION, 'utf8'));
    const decipher = createDecipheriv('aes-256-gcm', clave(), Buffer.from(iv, 'hex'));
    decipher.setAuthTag(Buffer.from(authTag, 'hex'));
    const plano = Buffer.concat([decipher.update(Buffer.from(datos, 'base64')), decipher.final()]);
    const envoltorio: Envoltorio = JSON.parse(plano.toString('utf8'));

    return Math.max(0, Math.round((envoltorio.expiraEn - Date.now()) / 60_000));
  } catch {
    return 0;
  }
}

export const RUTA_SESION = ARCHIVO_SESION;
