import 'server-only';
import sharp from 'sharp';
import { randomBytes } from 'crypto';

/**
 * Almacenamiento de fotos (estudiantes, personal, productos, logo…).
 *
 * Backend: Amazon S3 (bucket PRIVADO — son fotos de menores). Si el env de S3
 * no está configurado, cae a base64 (patrón actual de la app: logo/productos)
 * para poder probar sin llaves. La "ref" que se guarda en la columna es:
 *   - `s3:<key>`  cuando se subió a S3, o
 *   - un `data:image/jpeg;base64,…` cuando fue el fallback.
 *
 * Todo lo que sube pasa antes por `validarImagen` + `procesarImagen`: nada se
 * guarda tal como llegó del cliente, ni se confía en el Content-Type que manda.
 *
 * Env requerido para usar S3 (lo pone el usuario; nunca se commitea):
 *   FOTOS_S3_BUCKET, FOTOS_S3_REGION (o AWS_REGION),
 *   AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY
 */

const BUCKET = process.env.FOTOS_S3_BUCKET;
const REGION = process.env.FOTOS_S3_REGION ?? process.env.AWS_REGION;

/** Lado máximo de la foto que se guarda. Una foto de móvil son 3000px y varios
 *  MB; a 800 se ve bien en una ficha y en un carnet impreso, y pesa ~80 KB. */
export const LADO_FOTO = 800;
/** Lado de la miniatura: lo que se pinta en listas y avatares (~6 KB). */
export const LADO_MINIATURA = 160;
/** Tope de lo que aceptamos recibir. Por encima ni se intenta decodificar. */
export const MAX_BYTES_SUBIDA = 12 * 1024 * 1024;

/** Formatos que aceptamos decodificar. Un SVG o un TIFF no son fotos de cámara
 *  y el primero además puede traer scripts; se rechazan en la puerta. */
const FORMATOS_ACEPTADOS = new Set(['jpeg', 'jpg', 'png', 'webp', 'heif', 'avif', 'gif']);

export function s3Configurado(): boolean {
  return !!(BUCKET && REGION && process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY);
}

export interface ImagenValida {
  formato: string;
  ancho: number;
  alto: number;
}

/**
 * Comprueba en el servidor que el binario recibido es de verdad una imagen.
 * No mira el Content-Type ni la extensión: hace que sharp lea la cabecera. Un
 * .exe renombrado a .jpg no tiene metadata y muere aquí.
 *
 * Devuelve null si no es una imagen aceptable (el llamador responde 415/400).
 */
export async function validarImagen(entrada: Buffer): Promise<ImagenValida | null> {
  if (entrada.length === 0 || entrada.length > MAX_BYTES_SUBIDA) return null;
  try {
    const meta = await sharp(entrada).metadata();
    if (!meta.format || !FORMATOS_ACEPTADOS.has(meta.format)) return null;
    if (!meta.width || !meta.height) return null;
    return { formato: meta.format, ancho: meta.width, alto: meta.height };
  } catch {
    // sharp lanza con cualquier binario que no sepa abrir: eso es la validación.
    return null;
  }
}

export interface OpcionesProceso {
  /** Lado mayor del resultado. Por defecto LADO_FOTO. */
  lado?: number;
  /** Calidad JPEG 1-100. Por defecto 82. */
  calidad?: number;
}

/**
 * Normaliza la foto: rota según EXIF (los móviles guardan la orientación en un
 * tag, no en los píxeles), recorta al lado pedido y reescribe como JPEG.
 *
 * Reescribir siempre es también saneamiento: el JPEG de salida no arrastra el
 * EXIF original, así que no publicamos la geolocalización de dónde se tomó la
 * foto de un menor ni el modelo del teléfono.
 */
export async function procesarImagen(entrada: Buffer, opciones: OpcionesProceso = {}): Promise<Buffer> {
  const lado = opciones.lado ?? LADO_FOTO;
  return sharp(entrada)
    .rotate()
    .resize(lado, lado, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: opciones.calidad ?? 82, mozjpeg: true })
    .toBuffer();
}

/** Clave estable-pero-no-adivinable dentro del bucket. El sufijo aleatorio evita
 *  que reemplazar la foto pise el objeto anterior mientras alguien lo está
 *  descargando con una URL firmada todavía viva. */
export function claveFoto(teamId: number, entidad: string, entidadId: number): string {
  return `${teamId}/${entidad}/${entidadId}-${randomBytes(6).toString('hex')}`;
}

/**
 * Sube una foto y devuelve su ref (lo que se guarda en la columna).
 * `keyHint` da un nombre estable dentro del bucket.
 */
export async function subirFoto(
  entrada: Buffer,
  keyHint: string,
  opciones: OpcionesProceso = {},
): Promise<string> {
  const jpg = await procesarImagen(entrada, opciones);
  return guardarJpeg(jpg, keyHint);
}

export interface FotoSubida {
  ref: string;
  refMiniatura: string;
  bytes: number;
  ancho: number;
  alto: number;
}

/**
 * Sube la foto y su miniatura de una vez. Es lo que usa el flujo de captura:
 * la ficha pinta la grande y las listas la chica, y así una lista de 400
 * estudiantes no descarga 400 fotos de 80 KB.
 */
export async function subirFotoConMiniatura(
  entrada: Buffer,
  keyHint: string,
): Promise<FotoSubida> {
  const [grande, chica] = await Promise.all([
    procesarImagen(entrada, { lado: LADO_FOTO }),
    procesarImagen(entrada, { lado: LADO_MINIATURA, calidad: 75 }),
  ]);
  const meta = await sharp(grande).metadata();
  const [ref, refMiniatura] = await Promise.all([
    guardarJpeg(grande, keyHint),
    guardarJpeg(chica, `${keyHint}-mini`),
  ]);
  return {
    ref,
    refMiniatura,
    bytes: grande.length,
    ancho: meta.width ?? 0,
    alto: meta.height ?? 0,
  };
}

/** Escribe un JPEG ya procesado en el backend vigente y devuelve su ref. */
async function guardarJpeg(jpg: Buffer, keyHint: string): Promise<string> {
  if (s3Configurado()) {
    const key = `fotos/${keyHint}.jpg`;
    const { S3Client, PutObjectCommand } = await import('@aws-sdk/client-s3');
    const s3 = new S3Client({ region: REGION });
    await s3.send(new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: jpg,
      ContentType: 'image/jpeg',
      // Sin ACL pública: el bucket es privado, se lee con URL firmada.
    }));
    return `s3:${key}`;
  }

  return `data:image/jpeg;base64,${jpg.toString('base64')}`;
}

/**
 * Resuelve una ref a una URL mostrable en el navegador. Los `data:` se devuelven
 * tal cual; las de S3 se firman con vida corta (bucket privado). Devuelve null
 * si no hay foto o si es una ref de S3 pero el env de S3 ya no está.
 */
export async function urlDeFoto(ref: string | null | undefined): Promise<string | null> {
  if (!ref) return null;
  if (ref.startsWith('data:')) return ref;
  if (ref.startsWith('s3:')) {
    if (!s3Configurado()) return null;
    const key = ref.slice(3);
    const { S3Client, GetObjectCommand } = await import('@aws-sdk/client-s3');
    const { getSignedUrl } = await import('@aws-sdk/s3-request-presigner');
    const s3 = new S3Client({ region: REGION });
    return getSignedUrl(s3, new GetObjectCommand({ Bucket: BUCKET, Key: key }), { expiresIn: 3600 });
  }
  return null;
}

/**
 * Borra el objeto de una ref. Se llama al reemplazar o quitar una foto para no
 * dejar basura pagando en el bucket. Nunca lanza: si el borrado falla, el flujo
 * de negocio (la foto nueva ya guardada) no debe romperse por eso.
 */
export async function borrarFoto(ref: string | null | undefined): Promise<void> {
  if (!ref?.startsWith('s3:') || !s3Configurado()) return;
  try {
    const { S3Client, DeleteObjectCommand } = await import('@aws-sdk/client-s3');
    const s3 = new S3Client({ region: REGION });
    await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: ref.slice(3) }));
  } catch {
    // Objeto huérfano en S3: molesto, no grave. No rompemos la petición.
  }
}
