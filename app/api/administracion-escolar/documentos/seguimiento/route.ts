import { NextRequest, NextResponse } from 'next/server';
import { requireModuleAndPermission } from '@/lib/auth/api-guard';
import { seguimientoDeDocumentos } from '@/lib/administracion-escolar/documentos-seguimiento';

/**
 * Quién debe qué documentos, en todo el colegio.
 *
 * Va sin paginar a propósito: son cientos de matrículas, no miles, y la
 * pantalla necesita el total real para decir «faltan 128 de 465». Paginar
 * obligaría a contar dos veces lo mismo.
 */
export async function GET(req: NextRequest) {
  const auth = await requireModuleAndPermission('escolar', 'administracion-escolar:ver');
  if (!auth.ok) return auth.response;

  const periodoId = Number(req.nextUrl.searchParams.get('periodoId')) || null;
  const datos = await seguimientoDeDocumentos(auth.teamId, { periodoId });
  return NextResponse.json(datos);
}
