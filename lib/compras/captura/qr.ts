import 'server-only';
import type { Metadata, Region } from 'sharp';
import jsQR from 'jsqr';

/**
 * sharp se carga cuando se va a usar, no al importar el módulo.
 *
 * Trae un binario nativo (libvips) que hay que copiar a mano al paquete de cada
 * función —ver `outputFileTracingIncludes` en next.config—. Con el import
 * arriba, olvidarse de una ruta no deja «sin QR»: tumba la ruta ENTERA con un
 * 500 al cargarla, que es lo que pasó en producción el 2026-09-23 con el enlace
 * para subir facturas. Cargándolo aquí, si el binario falta se pierde la lectura
 * del QR —la IA sigue leyendo la factura— y el teléfono puede subirla igual.
 */
type Sharp = typeof import('sharp')['default'];
let sharpCargado: Sharp | null | undefined;
async function cargarSharp() {
  if (sharpCargado !== undefined) return sharpCargado;
  try {
    sharpCargado = (await import('sharp')).default;
  } catch (e) {
    console.error('[captura-factura] sharp no está disponible: la foto se lee solo con IA', e);
    sharpCargado = null;
  }
  return sharpCargado;
}

/**
 * Busca un QR en la foto de una factura. Devuelve su texto o null.
 *
 * El QR del e-CF ocupa una esquina del papel, y en una foto de teléfono puede
 * quedar pequeño, girado o con poca luz. Se prueba a varias escalas —jsQR va
 * mejor cuando el código tiene unos cientos de píxeles— y además en la mitad
 * de abajo, donde lo imprime la representación de la DGII. Se detiene en el
 * primero que lee.
 */
export async function leerQr(buffer: Buffer): Promise<string | null> {
  const sharp = await cargarSharp();
  if (!sharp) return null;
  let meta: Metadata;
  try {
    meta = await sharp(buffer).rotate().metadata();
  } catch {
    return null; // no es una imagen que sharp entienda (p. ej. un PDF)
  }
  const ancho = meta.width ?? 0;
  const alto = meta.height ?? 0;
  if (!ancho || !alto) return null;

  const intentos: { lado: number; recorte?: Region }[] = [
    { lado: 1600 },
    { lado: 2400 },
    { lado: 1000 },
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
