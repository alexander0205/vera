/**
 * Informe de calidad del asistente con gente real (interno, de todas las
 * empresas): cuánto se resuelve sin IA, qué cae a la IA y qué recibe 👎.
 *
 *   npx tsx scripts/calidad-asistente.ts [días=30] [salida.md]
 *
 * Las preguntas salen anonimizadas (correos, teléfonos, RNC/cédulas, llaves).
 * Úsalo para decidir qué respuesta automática escribir después.
 */
import { config } from 'dotenv';
config({ path: '.env.local' });
import { writeFileSync } from 'node:fs';

async function main() {
  const dias = Math.max(1, Number(process.argv[2] ?? 30) || 30);
  const salida = process.argv[3];
  const { db } = await import('../lib/db/drizzle');
  const { asistenteMensajes } = await import('../lib/db/schema');
  const { and, asc, eq, gte, inArray } = await import('drizzle-orm');
  const { resumirCalidad, informeCalidad } = await import('../lib/asistente/calidad');

  const desde = new Date(Date.now() - dias * 86_400_000);
  const respuestas = await db.select({
    id: asistenteMensajes.id, conversacionId: asistenteMensajes.conversacionId, origen: asistenteMensajes.origen,
    valoracion: asistenteMensajes.valoracion, motivo: asistenteMensajes.valoracionMotivo,
  }).from(asistenteMensajes)
    .where(and(eq(asistenteMensajes.rol, 'assistant'), gte(asistenteMensajes.creadoEn, desde)))
    .limit(5000);

  const conversaciones = [...new Set(respuestas.map((r) => r.conversacionId))];
  const preguntas = conversaciones.length
    ? await db.select({ id: asistenteMensajes.id, conversacionId: asistenteMensajes.conversacionId, contenido: asistenteMensajes.contenido })
      .from(asistenteMensajes)
      .where(and(eq(asistenteMensajes.rol, 'user'), inArray(asistenteMensajes.conversacionId, conversaciones)))
      .orderBy(asc(asistenteMensajes.id))
    : [];

  // Cada respuesta con la pregunta que la originó: la última del usuario antes de ella.
  const porConv = new Map<number, { id: number; contenido: string }[]>();
  for (const p of preguntas) {
    const l = porConv.get(p.conversacionId) ?? [];
    l.push({ id: p.id, contenido: p.contenido });
    porConv.set(p.conversacionId, l);
  }
  const filas = respuestas.map((r) => {
    const antes = (porConv.get(r.conversacionId) ?? []).filter((p) => p.id < r.id).pop();
    return {
      pregunta: antes?.contenido ?? '',
      origen: (r.origen === 'local' || r.origen === 'ia' ? r.origen : null) as 'local' | 'ia' | null,
      valoracion: (r.valoracion === 1 ? 1 : r.valoracion === -1 ? -1 : null) as 1 | -1 | null,
      motivo: r.motivo,
    };
  }).filter((f) => f.pregunta);

  const md = informeCalidad(resumirCalidad(filas), dias);
  if (salida) {
    writeFileSync(salida, md, 'utf8');
    console.log(`${filas.length} respuestas → ${salida}`);
  } else {
    console.log(md);
  }
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
