/** GET /api/administracion-escolar/comprobantes?estado=pendiente */

import { NextRequest, NextResponse } from 'next/server';
import { requireModuleAndPermission } from '@/lib/auth/api-guard';
import { listarComprobantes } from '@/lib/administracion-escolar/comprobantes';

const ESTADOS = ['pendiente', 'aprobado', 'rechazado'] as const;
type Estado = (typeof ESTADOS)[number];

export async function GET(req: NextRequest) {
  const auth = await requireModuleAndPermission('escolar', 'administracion-escolar:ver');
  if (!auth.ok) return auth.response;

  const crudo = req.nextUrl.searchParams.get('estado');
  const estado = ESTADOS.includes(crudo as Estado) ? (crudo as Estado) : undefined;

  return NextResponse.json({ comprobantes: await listarComprobantes(auth.teamId, estado) });
}
