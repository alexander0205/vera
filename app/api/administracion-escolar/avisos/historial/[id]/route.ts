import { NextRequest, NextResponse } from 'next/server';
import { requireModuleAndPermission } from '@/lib/auth/api-guard';
import { textoDeAviso } from '@/lib/administracion-escolar/panel-avisos';

/** Lo que decía un aviso enviado. `texto: null` = salió antes de guardarlo. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireModuleAndPermission('escolar', 'administracion-escolar:ver');
  if (!auth.ok) return auth.response;
  const id = Number((await params).id);
  const aviso = Number.isInteger(id) && id > 0 ? await textoDeAviso(auth.teamId, id) : null;
  if (!aviso) return NextResponse.json({ error: 'No encontrado' }, { status: 404 });
  return NextResponse.json(aviso);
}
