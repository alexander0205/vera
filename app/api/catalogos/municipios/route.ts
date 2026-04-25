/**
 * GET /api/catalogos/municipios?provincia=<codigo>
 *
 * Devuelve los municipios de RD filtrados por provincia (opcional).
 * Proxea a ecf-api para que el cliente nunca llame directamente a la API interna.
 * Respuesta cacheada 1 hora — los catálogos DGII cambian muy raramente.
 */

import { NextRequest, NextResponse } from 'next/server';
import { catalogos } from '@/lib/ecf-api/client';

export const revalidate = 3600; // ISR: 1 hora

export async function GET(request: NextRequest) {
  const provincia = request.nextUrl.searchParams.get('provincia') ?? undefined;

  try {
    const municipios = await catalogos.municipios(provincia);
    return NextResponse.json(municipios, {
      headers: { 'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400' },
    });
  } catch (err) {
    console.error('[GET /api/catalogos/municipios]', err);
    return NextResponse.json({ error: 'No se pudo cargar el catálogo de municipios' }, { status: 500 });
  }
}
