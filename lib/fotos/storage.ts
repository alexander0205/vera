import 'server-only';
import sharp from 'sharp';

/**
 * Almacenamiento de fotos de personas (estudiantes, personal).
 *
 * Backend: Amazon S3 (bucket PRIVADO — son fotos de menores). Si el env de S3
 * no está configurado, cae a base64 (patrón actual de la app: logo/productos)
 * para poder probar sin llaves. La "ref" que se guarda en la columna es:
 *   - `s3:<key>`  cuando se subió a S3, o
 *   - un `data:image/jpeg;base64,…` cuando fue el fallback.
 *
 * Env requerido para usar S3 (lo pone el usuario; nunca se commitea):
 *   FOTOS_S3_BUCKET, FOTOS_S3_REGION (o AWS_REGION),
 *   AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY
 */

const BUCKET = process.env.FOTOS_S3_BUCKET;
const REGION = process.env.FOTOS_S3_REGION ?? process.env.AWS_REGION;

export function s3Configurado(): boolean {
  return !!(BUCKET && REGION && process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY);
}

/** Normaliza la foto: rota según EXIF, recorta a ≤1024px, JPEG calidad 82. */
async function comprimir(entrada: Buffer): Promise<Buffer> {
  return sharp(entrada)
    .rotate()
    .resize(1024, 1024, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 82 })
    .toBuffer();
}

/**
 * Sube una foto y devuelve su ref (lo que se guarda en la columna del
 * estudiante/personal). `keyHint` da un nombre estable dentro del bucket.
 */
export async function subirFoto(entrada: Buffer, keyHint: string): Promise<string> {
  const jpg = await comprimir(entrada);

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
