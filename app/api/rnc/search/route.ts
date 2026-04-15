/**
 * GET /api/rnc/search?q=xxxxx
 *
 * Busca en el padrón de contribuyentes (rnc_padron).
 * - Si q son solo dígitos → búsqueda exacta por RNC
 * - Si q tiene letras → búsqueda por nombre (ILIKE)
 * - Combina resultados de ambas estrategias
 * - Límite: 15 resultados
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/drizzle';
import { rncPadron } from '@/lib/db/schema';
import { eq, ilike, or, sql } from 'drizzle-orm';

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get('q')?.trim() ?? '';

  if (q.length < 2) {
    return NextResponse.json({ results: [] });
  }

  try {
    const esRnc = /^\d+$/.test(q);

    let results;

    if (esRnc) {
      // Búsqueda exacta por RNC o inicio de RNC
      results = await db
        .select({
          rnc:             rncPadron.rnc,
          nombre:          rncPadron.nombre,
          nombreComercial: rncPadron.nombreComercial,
          estado:          rncPadron.estado,
        })
        .from(rncPadron)
        .where(
          or(
            eq(rncPadron.rnc, q),
            ilike(rncPadron.rnc, `${q}%`)
          )
        )
        .limit(10);
    } else {
      // Búsqueda por nombre usando ILIKE con contiene
      results = await db
        .select({
          rnc:             rncPadron.rnc,
          nombre:          rncPadron.nombre,
          nombreComercial: rncPadron.nombreComercial,
          estado:          rncPadron.estado,
        })
        .from(rncPadron)
        .where(
          or(
            ilike(rncPadron.nombre, `${q}%`),          // Empieza con (más relevante)
            ilike(rncPadron.nombre, `%${q}%`),         // Contiene
            ilike(rncPadron.nombreComercial, `%${q}%`) // Nombre comercial
          )
        )
        .orderBy(
          // Priorizar los que empiezan con el query
          sql`CASE WHEN ${rncPadron.nombre} ILIKE ${q + '%'} THEN 0 ELSE 1 END`,
          rncPadron.nombre
        )
        .limit(15);
    }

    // Etiquetar estado
    const labeled = results.map((r) => ({
      ...r,
      estadoLabel: r.estado === '2' ? 'Activo' : r.estado === '3' ? 'Suspendido' : 'Inactivo',
    }));

    return NextResponse.json({ results: labeled });
  } catch (err: unknown) {
    console.error('[/api/rnc/search]', err);
    return NextResponse.json({ results: [], error: 'Error en búsqueda' });
  }
}
