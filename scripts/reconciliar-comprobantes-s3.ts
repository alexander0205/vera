/**
 * Reconcilia el bucket de comprobantes de pago contra la base de datos.
 *
 * Borrar un comprobante POR LA APP borra la fila y sus objetos. Borrar filas
 * por SQL —limpiezas a mano, un DELETE en cascada, restaurar un backup viejo—
 * deja el objeto en S3 sin nada que lo apunte: invisible para siempre y
 * pagando espacio. Este script encuentra esos huérfanos.
 *
 * Por defecto solo REPORTA. Para borrar de verdad:
 *
 *   npx tsx scripts/reconciliar-comprobantes-s3.ts            # simulacro
 *   npx tsx scripts/reconciliar-comprobantes-s3.ts --borrar   # borra
 *
 * Necesita credenciales con ListBucket sobre el prefijo, que los usuarios IAM
 * de la app NO tienen a propósito (por eso S3 les responde 403 y no 404 a un
 * objeto inexistente). Correr con un perfil administrativo:
 *
 *   AWS_PROFILE=admin npx tsx scripts/reconciliar-comprobantes-s3.ts
 *
 * Ojo con el prefijo: `prod` y `preview` son mundos distintos. Se toma de
 * S3_COMPROBANTES_PREFIX, igual que la app.
 */

import { S3Client, ListObjectsV2Command, DeleteObjectsCommand } from '@aws-sdk/client-s3';
import { db } from '@/lib/db/drizzle';
import { pagoAdjuntos } from '@/lib/db/schema';

const BUCKET = process.env.S3_COMPROBANTES_BUCKET;
const REGION = process.env.S3_COMPROBANTES_REGION ?? 'us-east-1';
const PREFIX = process.env.S3_COMPROBANTES_PREFIX ?? 'preview';
const BORRAR = process.argv.includes('--borrar');

/** Margen antes de considerar huérfano a un objeto recién subido: entre el
 *  PutObject y el INSERT hay un instante en que existe sin fila. */
const GRACIA_MINUTOS = 30;

async function main() {
  if (!BUCKET) throw new Error('Falta S3_COMPROBANTES_BUCKET');

  // Credenciales del entorno (perfil de AWS o variables), no las de la app:
  // hace falta ListBucket y los usuarios de la app no lo tienen.
  const s3 = new S3Client({ region: REGION });

  // ── 1. Todo lo que la DB dice que existe ──────────────────────────────────
  const filas = await db
    .select({ s3Key: pagoAdjuntos.s3Key, thumbS3Key: pagoAdjuntos.thumbS3Key })
    .from(pagoAdjuntos);

  const vivas = new Set<string>();
  for (const f of filas) {
    if (f.s3Key)      vivas.add(f.s3Key);
    if (f.thumbS3Key) vivas.add(f.thumbS3Key);
  }

  // ── 2. Todo lo que hay en el bucket ───────────────────────────────────────
  const corte = new Date(Date.now() - GRACIA_MINUTOS * 60_000);
  const huerfanos: string[] = [];
  let totalObjetos = 0, bytesHuerfanos = 0, token: string | undefined;

  do {
    const res = await s3.send(new ListObjectsV2Command({
      Bucket: BUCKET, Prefix: `${PREFIX}/`, ContinuationToken: token,
    }));
    for (const o of res.Contents ?? []) {
      if (!o.Key) continue;
      totalObjetos++;
      if (vivas.has(o.Key)) continue;
      if (o.LastModified && o.LastModified > corte) continue; // recién subido
      huerfanos.push(o.Key);
      bytesHuerfanos += o.Size ?? 0;
    }
    token = res.IsTruncated ? res.NextContinuationToken : undefined;
  } while (token);

  // ── 3. Reporte ────────────────────────────────────────────────────────────
  const mb = (b: number) => `${(b / 1024 / 1024).toFixed(2)} MB`;
  console.log(`bucket:     ${BUCKET}/${PREFIX}`);
  console.log(`en la DB:   ${filas.length} adjuntos → ${vivas.size} objetos esperados`);
  console.log(`en S3:      ${totalObjetos} objetos`);
  console.log(`huérfanos:  ${huerfanos.length} (${mb(bytesHuerfanos)})`);

  if (huerfanos.length === 0) { console.log('\nNada que limpiar.'); return; }
  for (const k of huerfanos.slice(0, 20)) console.log(`  · ${k}`);
  if (huerfanos.length > 20) console.log(`  … y ${huerfanos.length - 20} más`);

  if (!BORRAR) {
    console.log('\nSimulacro: no se borró nada. Repite con --borrar para eliminarlos.');
    return;
  }

  // ── 4. Borrado en lotes de 1000 (tope de la API) ──────────────────────────
  let borrados = 0;
  for (let i = 0; i < huerfanos.length; i += 1000) {
    const lote = huerfanos.slice(i, i + 1000);
    const res = await s3.send(new DeleteObjectsCommand({
      Bucket: BUCKET,
      Delete: { Objects: lote.map(Key => ({ Key })), Quiet: true },
    }));
    borrados += lote.length - (res.Errors?.length ?? 0);
    for (const e of res.Errors ?? []) console.error(`  ✗ ${e.Key}: ${e.Message}`);
  }
  console.log(`\nBorrados ${borrados} de ${huerfanos.length} objetos.`);
}

main()
  .then(() => process.exit(0))
  .catch(err => { console.error(err); process.exit(1); });
