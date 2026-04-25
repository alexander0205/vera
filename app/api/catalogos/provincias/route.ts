/**
 * GET /api/catalogos/provincias
 *
 * Devuelve las 32 provincias de RD con sus códigos DGII.
 * Proxea a ecf-api para que el cliente nunca llame directamente a la API interna.
 * Respuesta cacheada 1 hora — los catálogos DGII cambian muy raramente.
 */

import { NextResponse } from 'next/server';
import { catalogos } from '@/lib/ecf-api/client';

export const revalidate = 3600; // ISR: 1 hora

export async function GET() {
  try {
    const provincias = await catalogos.provincias();
    return NextResponse.json(provincias, {
      headers: { 'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400' },
    });
  } catch (err) {
    console.error('[GET /api/catalogos/provincias]', err);
    return NextResponse.json({ error: 'No se pudo cargar el catálogo de provincias' }, { status: 500 });
  }
}
