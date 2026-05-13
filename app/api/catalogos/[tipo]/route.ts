/**
 * GET /api/catalogos/[tipo]?parent=<codigo>
 *
 * Endpoint genérico para cualquier catálogo DGII almacenado localmente.
 * Permite exponer todos los catálogos sin crear un route file por cada uno.
 *
 * Ejemplos:
 *   /api/catalogos/tipos-comprobante
 *   /api/catalogos/monedas
 *   /api/catalogos/unidades-medida
 *   /api/catalogos/distritos-municipales?parent=010100
 *
 * Los slugs URL aceptados son tanto con guiones (`tipos-comprobante`) como
 * con underscores (`tipos_comprobante`) para máxima compatibilidad.
 *
 * Nota: /api/catalogos/provincias y /api/catalogos/municipios mantienen sus
 * route files dedicados para no romper integraciones existentes.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getCatalogo, type CatalogoTipo } from '@/lib/dgii/catalogos';

export const revalidate = 3600;

const VALID_TIPOS: ReadonlySet<CatalogoTipo> = new Set<CatalogoTipo>([
  'ambientes',
  'tipos_comprobante',
  'tipos_documento',
  'formas_pago',
  'monedas',
  'unidades_medida',
  'indicadores_itbis',
  'paises',
  'tipos_ingreso',
  'tipos_pago',
  'provincias',
  'municipios',
  'distritos_municipales',
  'impuestos_adicionales',
  'codigos_modificacion',
]);

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tipo: string }> },
) {
  const { tipo: slug } = await params;
  const tipo = slug.replace(/-/g, '_') as CatalogoTipo;

  if (!VALID_TIPOS.has(tipo)) {
    return NextResponse.json({ error: `Catálogo desconocido: ${slug}` }, { status: 404 });
  }

  const parent = request.nextUrl.searchParams.get('parent') ?? undefined;

  try {
    const items = await getCatalogo(tipo, parent);
    return NextResponse.json(items, {
      headers: { 'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400' },
    });
  } catch (err) {
    console.error(`[GET /api/catalogos/${slug}]`, err);
    return NextResponse.json({ error: `No se pudo cargar el catálogo ${slug}` }, { status: 500 });
  }
}
