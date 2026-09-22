import 'server-only';
import sharp, { type Metadata, type Region } from 'sharp';
import jsQR from 'jsqr';

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
