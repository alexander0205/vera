/**
 * Comprueba de punta a punta la base de los documentos de matrícula:
 * la semilla es idempotente, el tipo de inscripción se deduce solo y el
 * checklist se arma con lo exigido para ese nivel.
 *
 * OJO con el orden de --env-file: Node deja ganar al ÚLTIMO, así que
 * `--env-file=.env --env-file=.env.local` apunta a DEV. Invertido apunta a
 * PRODUCCIÓN.
 *
 *   npx tsx --env-file=.env --env-file=.env.local scripts/probar-documentos.ts
 */
import { sembrarDocumentos, checklistDeMatricula, contextoDeMatricula } from '../lib/administracion-escolar/documentos';

const TEAM = 9;
const MATRICULA = 2339;

async function main() {
  const s1 = await sembrarDocumentos(TEAM);
  const s2 = await sembrarDocumentos(TEAM);
  console.log(`semilla: ${s1.creados} creados · repetirla crea ${s2.creados} (debe ser 0)`);

  const ctx = await contextoDeMatricula(TEAM, MATRICULA);
  console.log('contexto:', JSON.stringify(ctx));

  const ck = await checklistDeMatricula(TEAM, MATRICULA);
  console.log(`filas: ${ck?.filas.length} · resumen: ${JSON.stringify(ck?.resumen)}`);
  for (const f of ck?.filas ?? []) console.log(`  · ${f.nombre} [${f.exigencia}] → ${f.estado}`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
