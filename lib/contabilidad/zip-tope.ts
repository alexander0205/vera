/**
 * Tope al tamaño DESCOMPRIMIDO de un archivo zip (un .xlsx lo es) antes de
 * dárselo a ExcelJS, que descomprime todo en memoria.
 *
 * Los tamaños que el zip DECLARA los escribe quien arma el archivo y se pueden
 * falsear (un zip de 300 KB que dice ocupar 100 bytes y se infla a 300 MB). Por
 * eso aquí no se confía en ellos: cada entrada se descomprime de verdad con un
 * tope de salida, y el total real se compara contra el límite. Se corta al pasar
 * de los bytes permitidos, sin llegar a inflar el resto.
 */

import { inflateRawSync } from 'node:zlib';

export class ZipDemasiadoGrandeError extends Error {
  constructor(message: string) { super(message); this.name = 'ZipDemasiadoGrandeError'; }
}

export const MAX_DESCOMPRIMIDO_BYTES = 40 * 1024 * 1024;
export const MAX_ENTRADAS_ZIP = 500;

const INVALIDO = 'El archivo no es un Excel (.xlsx) válido.';
const GRANDE = 'El archivo, ya descomprimido, es demasiado grande para ser un estado de cuenta.';

/** Descomprime cada entrada con tope y suma lo REAL. Lanza si no se puede leer o pasa del tope. */
export function validarTamanoZip(
  bytes: Uint8Array,
  opts: { maxDescomprimido?: number; maxEntradas?: number } = {},
): { entradas: number; descomprimido: number } {
  const maxBytes = opts.maxDescomprimido ?? MAX_DESCOMPRIMIDO_BYTES;
  const maxEntradas = opts.maxEntradas ?? MAX_ENTRADAS_ZIP;
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  // Registro de fin del directorio central: en los últimos 64 KB + 22 bytes.
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 22 - 65_535); i--) {
    if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new ZipDemasiadoGrandeError(INVALIDO);

  const total = dv.getUint16(eocd + 10, true);
  let pos = dv.getUint32(eocd + 16, true);
  if (total > maxEntradas) throw new ZipDemasiadoGrandeError('El archivo trae demasiadas partes para ser un estado de cuenta.');

  let descomprimido = 0;
  for (let n = 0; n < total; n++) {
    if (pos + 46 > bytes.length || dv.getUint32(pos, true) !== 0x02014b50) throw new ZipDemasiadoGrandeError(INVALIDO);
    const metodo = dv.getUint16(pos + 10, true);
    const comprimido = dv.getUint32(pos + 20, true);
    const localOffset = dv.getUint32(pos + 42, true);
    const largoNombre = dv.getUint16(pos + 28, true);
    const largoExtra = dv.getUint16(pos + 30, true);
    const largoComentario = dv.getUint16(pos + 32, true);
    pos += 46 + largoNombre + largoExtra + largoComentario;

    if (localOffset + 30 > bytes.length || dv.getUint32(localOffset, true) !== 0x04034b50) throw new ZipDemasiadoGrandeError(INVALIDO);
    const inicio = localOffset + 30 + dv.getUint16(localOffset + 26, true) + dv.getUint16(localOffset + 28, true);
    if (inicio + comprimido > bytes.length) throw new ZipDemasiadoGrandeError(INVALIDO);
    const datos = bytes.subarray(inicio, inicio + comprimido);

    const presupuesto = maxBytes - descomprimido;
    if (metodo === 0) {
      descomprimido += datos.length;
    } else if (metodo === 8) {
      try {
        // +1: si sale más que el presupuesto, lanza en vez de inflar todo.
        descomprimido += inflateRawSync(datos, { maxOutputLength: presupuesto + 1 }).length;
      } catch (e) {
        const codigo = (e as { code?: string }).code;
        if (codigo === 'ERR_BUFFER_TOO_LARGE' || e instanceof RangeError) throw new ZipDemasiadoGrandeError(GRANDE);
        throw new ZipDemasiadoGrandeError(INVALIDO);
      }
    } else {
      throw new ZipDemasiadoGrandeError(INVALIDO);
    }
    if (descomprimido > maxBytes) throw new ZipDemasiadoGrandeError(GRANDE);
  }
  return { entradas: total, descomprimido };
}
