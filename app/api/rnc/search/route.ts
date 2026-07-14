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
import { getUser } from '@/lib/db/queries';
import { rateLimit } from '@/lib/rate-limit';

export async function GET(req: NextRequest) {
  // El padrón (~780k filas) es caro de buscar; exigir sesión y limitar tasa
  // evita que un tercero sin login lo use como vector de carga sobre la DB.
  const user = await getUser();
  if (!user) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  const rl = rateLimit(`rnc-search:${user.id}`, 30, 60_000);
  if (!rl.allowed) {
    return NextResponse.json(
      { results: [], error: 'Demasiadas búsquedas, intenta en un momento' },
      { status: 429 },
    );
  }

  const q = req.nextUrl.searchParams.get('q')?.trim() ?? '';

  // Mínimo 3 caracteres: el índice trigram (pg_trgm) opera sobre 3-gramas.
  if (q.length < 3) {
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

    // El padrón se sincroniza 1 vez/día (cron 4am); cachear en el browser evita
    // repetir la misma búsqueda mientras el usuario teclea/re-teclea.
    return NextResponse.json(
      { results: labeled },
      { headers: { 'Cache-Control': 'private, max-age=300' } },
    );
  } catch (err: unknown) {
    console.error('[/api/rnc/search]', err);
    return NextResponse.json({ results: [], error: 'Error en búsqueda' });
  }
}
