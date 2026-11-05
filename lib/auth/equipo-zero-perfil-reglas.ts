/**
 * Reglas puras de la foto y el cargo del equipo de Zero (migración 0218). Sin
 * base de datos: las usa la ruta antes de escribir y las prueban los tests.
 */

/** Máximo de caracteres del cargo (igual que la columna). */
export const CARGO_MAX = 80;

/**
 * Peso máximo de la foto ya recortada. El navegador la manda a 256×256 en JPEG
 * (unos 20–40 KB); el tope deja margen para un PNG o WebP sin dejar que alguien
 * meta archivos grandes en la base.
 */
export const FOTO_MAX_BYTES = 300 * 1024;

export type TipoFoto = 'image/jpeg' | 'image/png' | 'image/webp';

/**
 * El cargo tal como se guarda: sin espacios de sobra y como mucho `CARGO_MAX`
 * caracteres. Vacío = sin cargo (`null`). Algo que no es texto = inválido
 * (`undefined`), para distinguirlo de «quitar el cargo».
 */
export function normalizarCargo(v: unknown): string | null | undefined {
  if (v === null) return null;
  if (typeof v !== 'string') return undefined;
  const limpio = v.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!limpio) return null;
  return limpio.slice(0, CARGO_MAX);
}

/**
 * El tipo REAL de la imagen, mirando sus primeros bytes (no lo que diga quien
 * la manda), o `null` si no es JPEG, PNG ni WebP. Así nunca se sirve como
 * imagen algo que no lo es.
 */
export function tipoDeFoto(b: Uint8Array): TipoFoto | null {
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47
    && b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a) return 'image/png';
  if (b.length >= 12 && b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46
    && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return 'image/webp';
  return null;
}

export type FotoValida = { ok: true; bytes: Buffer; tipo: TipoFoto } | { ok: false; mensaje: string };

/** La foto que llega en base64 (con o sin prefijo `data:`), validada. */
export function validarFoto(base64: unknown): FotoValida {
  if (typeof base64 !== 'string' || !base64) return { ok: false, mensaje: 'No llegó la foto.' };
  const datos = base64.replace(/^data:[^;,]*;base64,/, '');
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(datos)) return { ok: false, mensaje: 'La foto llegó dañada.' };
  // Antes de decodificar: base64 ocupa 4/3 de los bytes.
  if (Math.floor((datos.length * 3) / 4) > FOTO_MAX_BYTES + 3) {
    return { ok: false, mensaje: 'La foto pesa demasiado. Prueba con otra.' };
  }
  const bytes = Buffer.from(datos, 'base64');
  if (bytes.length === 0) return { ok: false, mensaje: 'La foto llegó vacía.' };
  if (bytes.length > FOTO_MAX_BYTES) return { ok: false, mensaje: 'La foto pesa demasiado. Prueba con otra.' };
  const tipo = tipoDeFoto(bytes);
  if (!tipo) return { ok: false, mensaje: 'Solo se aceptan fotos JPG, PNG o WebP.' };
  return { ok: true, bytes, tipo };
}

/**
 * ¿Puede cambiar la foto y el cargo de esa persona? La propia persona, o el
 * dueño de la plataforma (que arma el equipo). Un admin no toca el perfil de
 * otro admin.
 */
export function puedeEditarPerfil(actor: { id: number; esDueno: boolean }, objetivoId: number): boolean {
  return actor.id === objetivoId || actor.esDueno;
}

/** La URL de la foto, con la versión para que el navegador la cachee sin enseñar una vieja. */
export const urlFotoEquipo = (userId: number, version: number) => `/api/admin/equipo/${userId}/foto?v=${version}`;
