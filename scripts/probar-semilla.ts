/** Comprueba que la semilla escribe en la base exactamente lo que dice el array. */
import { db } from '../lib/db/drizzle';
import { adminEscolarDocumentosRequeridos } from '../lib/db/schema';
import { SEMILLA_DOCUMENTOS, sembrarDocumentos } from '../lib/administracion-escolar/documentos';
import { eq } from 'drizzle-orm';

const TEAM_PRUEBA = 9;

async function main() {
  await db.delete(adminEscolarDocumentosRequeridos)
    .where(eq(adminEscolarDocumentosRequeridos.teamId, TEAM_PRUEBA));

  const { creados } = await sembrarDocumentos(TEAM_PRUEBA);
  const filas = await db.select().from(adminEscolarDocumentosRequeridos)
    .where(eq(adminEscolarDocumentosRequeridos.teamId, TEAM_PRUEBA));

  let mal = 0;
  for (const s of SEMILLA_DOCUMENTOS) {
    const f = filas.find((x) => x.nivel === s.nivel && x.tipoInscripcion === s.tipo && x.nombre === s.nombre);
    if (!f) { console.log(`FALTA: ${s.nombre}`); mal++; continue; }
    if (f.exigencia !== s.exigencia) {
      console.log(`EXIGENCIA MAL: "${s.nombre}" (${s.nivel}/${s.tipo}) semilla=${s.exigencia} base=${f.exigencia}`);
      mal++;
    }
    if (f.cantidad !== (s.cantidad ?? 1)) {
      console.log(`CANTIDAD MAL: "${s.nombre}" semilla=${s.cantidad ?? 1} base=${f.cantidad}`);
      mal++;
    }
  }
  console.log(`\ncreados: ${creados} · filas: ${filas.length} · discrepancias: ${mal}`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
