/**
 * GET /api/rnc/search?q=xxxxx
 *
 * Busca en el padrón de contribuyentes (rnc_padron).
 * - Si q son solo dígitos → búsqueda exacta por RNC
 * - Si q tiene letras → búsqueda por nombre (ILIKE)
 * - Combina resultados de ambas estrategias
 *
 * El padrón solo cambia 1 vez/día (sync desde DGII), así que los resultados se
 * cachean en el servidor por query (unstable_cache) y se invalidan con el tag
 * `rnc-padron` cuando el sync corre (ver lib/dgii/sync-padron.ts).
 */

import { NextRequest, NextResponse } from 'next/server';
import { unstable_cache } from 'next/cache';
import { db } from '@/lib/db/drizzle';
import { rncPadron } from '@/lib/db/schema';
import { eq, ilike, or, sql } from 'drizzle-orm';
import { getUser } from '@/lib/db/queries';
import { rateLimit } from '@/lib/rate-limit';

/**
 * Búsqueda cacheada en el servidor. La clave es el query `q` + el keyPart;
 * el tag `rnc-padron` permite invalidar todo el cache cuando el padrón se
 * actualiza. revalidate diario como red de seguridad si el sync no invalidara.
 */
const buscarPadron = unstable_cache(
  async (q: string) => {
    const esRnc = /^\d+$/.test(q);

    if (esRnc) {
      // Búsqueda exacta por RNC o inicio de RNC
      return db
        .select({
          rnc:             rncPadron.rnc,
          nombre:          rncPadron.nombre,
          nombreComercial: rncPadron.nombreComercial,
          estado:          rncPadron.estado,
        })
        .from(rncPadron)
        .where(or(eq(rncPadron.rnc, q), ilike(rncPadron.rnc, `${q}%`)))
        .limit(10);
    }

    // Búsqueda por nombre (contiene) + nombre comercial
    return db
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
  },
  ['rnc-padron-search'],
  { tags: ['rnc-padron'], revalidate: 86_400 },
);

export async function GET(req: NextRequest) {
  // El padrón (~780k filas) es caro de buscar; exigir sesión y limitar tasa
  // evita que un tercero sin login lo use como vector de carga sobre la DB.
  // (Todos los consumidores internos —POS, facturas, clientes, admin/empresas—
  // están detrás de login, así que esto no rompe ningún flujo público.)
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
    const results = await buscarPadron(q);

    const labeled = results.map((r) => ({
      ...r,
      estadoLabel: r.estado === '2' ? 'Activo' : r.estado === '3' ? 'Suspendido' : 'Inactivo',
    }));

    return NextResponse.json(
      { results: labeled },
      { headers: { 'Cache-Control': 'private, max-age=300' } },
    );
  } catch (err: unknown) {
    console.error('[/api/rnc/search]', err);
    return NextResponse.json({ results: [], error: 'Error en búsqueda' });
  }
}
