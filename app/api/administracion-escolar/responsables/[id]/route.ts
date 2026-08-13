import { NextRequest, NextResponse } from 'next/server';
import { requireModuleAndPermission } from '@/lib/auth/api-guard';
import { detalleResponsable } from '@/lib/administracion-escolar/responsables';

/** El detalle de una familia. Se pide solo al abrirla, no con el listado. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireModuleAndPermission('escolar', 'administracion-escolar:ver');
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const clientId = Number(id);
  if (!Number.isInteger(clientId) || clientId <= 0) {
    return NextResponse.json({ error: 'ID inválido' }, { status: 400 });
  }

  return NextResponse.json(await detalleResponsable(auth.teamId, clientId));
}
