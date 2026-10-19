/**
 * Junta las respuestas del asistente que la gente marcó con 👎 y las deja como
 * casos candidatos para el set de evaluación (sin datos personales).
 *
 *   npx tsx scripts/exportar-casos-asistente.ts [días=30] [salida.md]
 *
 * Es de uso interno del equipo de Zero: lee de todas las empresas, así que se
 * corre con la base que corresponda y el resultado no se comparte fuera.
 */
import { config } from 'dotenv';
config({ path: '.env.local' });
import { writeFileSync } from 'node:fs';

async function main() {
  const dias = Math.max(1, Number(process.argv[2] ?? 30) || 30);
  const salida = process.argv[3];
  const { db } = await import('../lib/db/drizzle');
  const { asistenteMensajes } = await import('../lib/db/schema');
  const { and, desc, eq, gte, lt } = await import('drizzle-orm');
  const { juntarCasos, informeMarkdown } = await import('../lib/asistente/casos');

  const desde = new Date(Date.now() - dias * 86_400_000);
  const malas = await db.select({
    id: asistenteMensajes.id, conversacionId: asistenteMensajes.conversacionId,
    contenido: asistenteMensajes.contenido, herramientas: asistenteMensajes.herramientas,
    motivo: asistenteMensajes.valoracionMotivo,
  }).from(asistenteMensajes)
    .where(and(eq(asistenteMensajes.valoracion, -1), gte(asistenteMensajes.valoradoEn, desde)))
    .orderBy(desc(asistenteMensajes.valoradoEn))
    .limit(500);

  const valoraciones = [];
  for (const m of malas) {
    const [p] = await db.select({ contenido: asistenteMensajes.contenido }).from(asistenteMensajes)
      .where(and(
        eq(asistenteMensajes.conversacionId, m.conversacionId),
        eq(asistenteMensajes.rol, 'user'),
        lt(asistenteMensajes.id, m.id),
      )).orderBy(desc(asistenteMensajes.id)).limit(1);
    if (!p) continue;
    valoraciones.push({ pregunta: p.contenido, respuesta: m.contenido, consultas: m.herramientas, motivo: m.motivo });
  }

  const md = informeMarkdown(juntarCasos(valoraciones), desde.toISOString().slice(0, 10));
  if (salida) {
    writeFileSync(salida, md, 'utf8');
    console.log(`${valoraciones.length} valoraciones → ${salida}`);
  } else {
    console.log(md);
  }
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
