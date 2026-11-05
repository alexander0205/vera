/**
 * Revisa un .xlsx (que es un zip) ANTES de abrirlo: un archivo de 2 MB puede
 * descomprimirse a cientos de MB («bomba zip») y tumbar el servidor al cargarlo
 * en memoria. Se lee solo el directorio central del zip —sin descomprimir nada—
 * y se suman los tamaños que declara cada entrada.
 *
 * Los tamaños declarados en el directorio los escribe quien arma el archivo y un
 * archivo malicioso puede mentir. Por eso, además de sumar lo declarado, se
 * descomprime cada entrada de verdad con un tope de bytes REALES y se corta en
 * cuanto se pasa, sin llegar a materializar la bomba.
 */

import { inflateRawSync } from 'node:zlib';

export interface LimitesZip {
  /** Suma de lo que ocupan las entradas ya descomprimidas. */
  maxBytesDescomprimidos: number;
  maxEntradas: number;
}

const MENSAJE_EXAGERADO = 'El archivo se descomprime a un tamaño exagerado para una lista de empleados: revisa que sea el archivo correcto.';

export type RevisionZip = { ok: true } | { ok: false; error: string };

export function revisarZip(buffer: ArrayBuffer, limites: LimitesZip): RevisionZip {
  const v = new DataView(buffer);
  const n = buffer.byteLength;
  if (n < 22 || v.getUint16(0, true) !== 0x4b50) return { ok: false, error: 'El archivo no es un Excel (.xlsx) válido.' };

  // El «fin del directorio central» está en los últimos 22 bytes más un comentario de hasta 64 KB.
  let eocd = -1;
  for (let i = n - 22; i >= Math.max(0, n - 22 - 65_535); i--) {
    if (v.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) return { ok: false, error: 'El archivo está dañado: no se encontró el directorio del zip.' };

  const entradas = v.getUint16(eocd + 10, true);
  const tamDirectorio = v.getUint32(eocd + 12, true);
  const inicio = v.getUint32(eocd + 16, true);
  if (entradas === 0xffff || tamDirectorio === 0xffffffff || inicio === 0xffffffff) {
    return { ok: false, error: 'El archivo usa un formato de zip no soportado (zip64).' };
  }
  if (entradas > limites.maxEntradas) return { ok: false, error: `El archivo tiene ${entradas} partes: un Excel normal no pasa de ${limites.maxEntradas}.` };
  if (inicio + tamDirectorio > n) return { ok: false, error: 'El archivo está dañado.' };

  let pos = inicio;
  let total = 0;
  let real = 0;
  for (let i = 0; i < entradas; i++) {
    if (pos + 46 > n || v.getUint32(pos, true) !== 0x02014b50) return { ok: false, error: 'El archivo está dañado.' };
    total += v.getUint32(pos + 24, true);
    if (total > limites.maxBytesDescomprimidos) {
      return { ok: false, error: MENSAJE_EXAGERADO };
    }
    const metodo = v.getUint16(pos + 10, true);
    const comprimido = v.getUint32(pos + 20, true);
    const nombre = v.getUint16(pos + 28, true);
    const extra = v.getUint16(pos + 30, true);
    const comentario = v.getUint16(pos + 32, true);
    const local = v.getUint32(pos + 42, true);
    pos += 46 + nombre + extra + comentario;

    // Descompresión real con tope: no se confía en el tamaño declarado.
    if (local + 30 > n || v.getUint32(local, true) !== 0x04034b50) return { ok: false, error: 'El archivo está dañado.' };
    const inicioDatos = local + 30 + v.getUint16(local + 26, true) + v.getUint16(local + 28, true);
    const datos = new Uint8Array(buffer, Math.min(inicioDatos, n), Math.max(0, Math.min(comprimido, n - inicioDatos)));
    if (metodo === 0) {
      real += datos.byteLength;
    } else if (metodo === 8) {
      try {
        real += inflateRawSync(datos, { maxOutputLength: Math.max(1, limites.maxBytesDescomprimidos - real) }).byteLength;
      } catch (err) {
        const excede = (err as { code?: string }).code === 'ERR_BUFFER_TOO_LARGE' || /larger than|maxOutputLength/i.test(String((err as Error).message));
        return { ok: false, error: excede ? MENSAJE_EXAGERADO : 'El archivo está dañado.' };
      }
    } else {
      return { ok: false, error: 'El archivo usa una compresión de zip no soportada.' };
    }
    if (real > limites.maxBytesDescomprimidos) return { ok: false, error: MENSAJE_EXAGERADO };
  }
  return { ok: true };
}
