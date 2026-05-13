/**
 * GET /api/catalogos/municipios?provincia=<codigo>
 *
 * Devuelve los municipios de RD desde la BD local (sincronizada vía cron).
 * Si se pasa `provincia`, filtra por código de provincia (ej: "010000").
 * Misma forma de respuesta que antes: { codigo, nombre, provinciaCodigo, ... }[].
 */

import { NextRequest, NextResponse } from 'next/server';
import { getCatalogo } from '@/lib/dgii/catalogos';

export const revalidate = 3600; // ISR: 1 hora

export async function GET(request: NextRequest) {
  const provincia = request.nextUrl.searchParams.get('provincia') ?? undefined;

  try {
    const municipios = await getCatalogo('municipios', provincia);
    return NextResponse.json(municipios, {
      headers: { 'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400' },
    });
  } catch (err) {
    console.error('[GET /api/catalogos/municipios]', err);
    return NextResponse.json({ error: 'No se pudo cargar el catálogo de municipios' }, { status: 500 });
  }
}
