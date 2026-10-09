/**
 * DELETE /api/administracion-escolar/documentos/enlaces/[id] — revoca el enlace.
 *
 * No se borra la fila: queda con `revocado_en` puesto. El rastro de que existió
 * un enlace, quién lo hizo y si alguien llegó a abrirlo es justo lo que hay que
 * poder mirar el día que se pregunte por qué un documento apareció solo.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireModuleAndPermission } from '@/lib/auth/api-guard';
import { revocarEnlace } from '@/lib/administracion-escolar/documentos-enlace';

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireModuleAndPermission('escolar', 'administracion-escolar:gestionar');
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const enlaceId = Number(id);
  if (!Number.isInteger(enlaceId) || enlaceId <= 0) {
    return NextResponse.json({ error: 'ID inválido' }, { status: 400 });
  }

  const ok = await revocarEnlace(auth.teamId, enlaceId);
  if (!ok) return NextResponse.json({ error: 'No encontrado' }, { status: 404 });
  return NextResponse.json({ ok: true });
}
