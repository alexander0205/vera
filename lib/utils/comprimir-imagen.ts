/**
 * Recomprime una imagen en el browser antes de subirla.
 *
 * Una foto de comprobante sacada con el celular pesa 3–8 MB; el body de las
 * funciones de Vercel tope en 4.5 MB, así que sin este paso la subida falla en
 * el caso más común de todos. A 1600px y calidad 0.8 un comprobante queda
 * legible (se lee el monto y la referencia) y pesa 150–300 KB.
 *
 * Los PDF y cualquier cosa que no sea imagen pasan intactos.
 */

const LADO_MAX = 1600;
const CALIDAD   = 0.8;

export async function comprimirImagen(file: File): Promise<File> {
  if (!file.type.startsWith('image/')) return file;

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    // Formato que el browser no sabe decodificar: que lo valide el servidor.
    return file;
  }

  const escala = Math.min(1, LADO_MAX / Math.max(bitmap.width, bitmap.height));
  // Ya es chica y liviana: reencodearla solo perdería calidad sin ganar nada.
  if (escala === 1 && file.size < 400_000) {
    bitmap.close();
    return file;
  }

  const ancho = Math.round(bitmap.width * escala);
  const alto  = Math.round(bitmap.height * escala);

  const canvas = document.createElement('canvas');
  canvas.width  = ancho;
  canvas.height = alto;
  const ctx = canvas.getContext('2d');
  if (!ctx) { bitmap.close(); return file; }

  // Fondo blanco: un PNG con transparencia sobre JPEG saldría con fondo negro.
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, ancho, alto);
  ctx.drawImage(bitmap, 0, 0, ancho, alto);
  bitmap.close();

  const blob = await new Promise<Blob | null>(res =>
    canvas.toBlob(res, 'image/jpeg', CALIDAD),
  );
  if (!blob || blob.size >= file.size) return file;

  const nombre = file.name.replace(/\.[^.]+$/, '') + '.jpg';
  return new File([blob], nombre, { type: 'image/jpeg', lastModified: file.lastModified });
}
