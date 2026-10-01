import 'server-only';
import type { Region } from 'sharp';
import jsQR from 'jsqr';
import { decode as decodificarJpeg } from 'jpeg-js';

/**
 * Busca un QR en la foto de una factura. Devuelve su texto o null.
 *
 * El QR del e-CF ocupa una esquina del papel, y en una foto de teléfono puede
 * quedar pequeño, girado o con poca luz. Se prueba a varias escalas —jsQR va
 * mejor cuando el código tiene unos cientos de píxeles— y además en la mitad
 * de abajo, donde lo imprime la representación de la DGII. Se detiene en el
 * primero que lee.
 *
 * Dos caminos para llegar a los píxeles:
 *
 *   1. **sharp**, si carga: entiende JPEG, PNG y WEBP, endereza por EXIF y
 *      reescala promediando. Es el bueno.
 *   2. **jpeg-js**, JavaScript puro, cuando sharp no está. Su binario nativo no
 *      siempre viaja con la función: en producción, el 2026-09-23, no viajaba —y
 *      el `outputFileTracingIncludes` de next.config no lo arregló—, así que el
 *      QR no se leía NUNCA y todo entraba por IA. Solo JPEG, que es lo que manda
 *      el teléfono: la página comprime a JPEG antes de subir.
 *
 * Quedarse sin QR nunca es un error: la IA lee la factura igual.
 */

type Sharp = typeof import('sharp')['default'];
let sharpCargado: Sharp | null | undefined;

/** sharp se carga al usarlo: con el import arriba, su ausencia tumba la ruta entera. */
async function cargarSharp(): Promise<Sharp | null> {
  if (sharpCargado !== undefined) return sharpCargado;
  try {
    sharpCargado = (await import('sharp')).default;
  } catch (e) {
    console.warn('[captura-factura] sharp no está disponible: el QR se busca con el decodificador puro', e);
    sharpCargado = null;
  }
  return sharpCargado;
}

/** Píxeles en crudo, como los quiere jsQR. */
export interface Lienzo {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

const LADOS = [1600, 2400, 1000];

export async function leerQr(buffer: Buffer): Promise<string | null> {
  const sharp = await cargarSharp();
  return sharp ? conSharp(sharp, buffer) : conJpegPuro(buffer);
}

async function conSharp(sharp: Sharp, buffer: Buffer): Promise<string | null> {
  let ancho = 0;
  let alto = 0;
  try {
    const meta = await sharp(buffer).rotate().metadata();
    ancho = meta.width ?? 0;
    alto = meta.height ?? 0;
  } catch {
    return null; // no es una imagen que sharp entienda (p. ej. un PDF)
  }
  if (!ancho || !alto) return null;

  const intentos: { lado: number; recorte?: Region }[] = [
    ...LADOS.map((lado) => ({ lado })),
    { lado: 1600, recorte: { left: 0, top: Math.floor(alto / 2), width: ancho, height: alto - Math.floor(alto / 2) } },
  ];
  for (const intento of intentos) {
    try {
      let img = sharp(buffer).rotate();
      if (intento.recorte) img = img.extract(intento.recorte);
      const { data, info } = await img
        .resize({ width: intento.lado, height: intento.lado, fit: 'inside', withoutEnlargement: true })
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
      const leido = jsQR(new Uint8ClampedArray(data.buffer, data.byteOffset, data.byteLength), info.width, info.height);
      if (leido?.data) return leido.data;
    } catch {
      // Una escala que falla no invalida las demás.
    }
  }
  return null;
}

/** La firma de un JPEG. Es lo único que sabe leer el respaldo. */
export const esJpeg = (b: Buffer): boolean => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;

function conJpegPuro(buffer: Buffer): string | null {
  if (!esJpeg(buffer)) return null;
  let img: { data: Uint8Array; width: number; height: number };
  try {
    // El tope corta una foto disparatada antes de que se coma la memoria de la función.
    img = decodificarJpeg(buffer, { useTArray: true, formatAsRGBA: true, maxMemoryUsageInMB: 256 });
  } catch {
    return null;
  }
  if (!img.width || !img.height) return null;
  const lienzo: Lienzo = {
    data: new Uint8ClampedArray(img.data.buffer, img.data.byteOffset, img.data.byteLength),
    width: img.width,
    height: img.height,
  };

  for (const lado of LADOS) {
    const reducido = reducir(lienzo, lado);
    const leido = jsQR(reducido.data, reducido.width, reducido.height);
    if (leido?.data) return leido.data;
  }
  const abajo = reducir(recortarAbajo(lienzo), 1600);
  return jsQR(abajo.data, abajo.width, abajo.height)?.data ?? null;
}

/**
 * Reduce tomando un píxel de cada n, sin promediar. Un QR es blanco y negro con
 * módulos grandes: el vecino más cercano lo conserva y no cuesta nada.
 */
export function reducir(l: Lienzo, ladoMax: number): Lienzo {
  const paso = Math.max(1, Math.ceil(Math.max(l.width, l.height) / ladoMax));
  if (paso === 1) return l;
  const width = Math.floor(l.width / paso);
  const height = Math.floor(l.height / paso);
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    const filaOrigen = y * paso * l.width * 4;
    const filaDestino = y * width * 4;
    for (let x = 0; x < width; x++) {
      const origen = filaOrigen + x * paso * 4;
      const destino = filaDestino + x * 4;
      data[destino] = l.data[origen];
      data[destino + 1] = l.data[origen + 1];
      data[destino + 2] = l.data[origen + 2];
      data[destino + 3] = l.data[origen + 3];
    }
  }
  return { data, width, height };
}

/** La mitad de abajo, que es donde la DGII imprime el timbre. */
export function recortarAbajo(l: Lienzo): Lienzo {
  const desde = Math.floor(l.height / 2);
  return {
    data: l.data.subarray(desde * l.width * 4, l.height * l.width * 4),
    width: l.width,
    height: l.height - desde,
  };
}
