/**
 * GET /api/catalogos/provincias
 *
 * Devuelve las 32 provincias de RD con sus códigos DGII desde la BD local
 * (sincronizada vía /api/cron/dgii-catalogos-sync). Fallback a ecf-api si la
 * tabla está vacía. Misma forma de respuesta que antes: { codigo, nombre, ... }[].
 */

import { NextResponse } from 'next/server';
import { getProvincias } from '@/lib/dgii/catalogos';

export const revalidate = 3600; // ISR: 1 hora

export async function GET() {
  try {
    const provincias = await getProvincias();
    return NextResponse.json(provincias, {
      headers: { 'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400' },
    });
  } catch (err) {
    console.error('[GET /api/catalogos/provincias]', err);
    return NextResponse.json({ error: 'No se pudo cargar el catálogo de provincias' }, { status: 500 });
  }
}
