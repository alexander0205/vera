/**
 * Escribir en la conversación de una tarea.
 *
 *   POST { texto } → el mensaje queda firmado por quien lo escribe
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireModuleAndPermission } from '@/lib/auth/api-guard';
import { agregarMensaje } from '@/lib/administracion-escolar/tareas';
import { autorDe, validarMensaje } from '@/lib/administracion-escolar/tareas-reglas';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireModuleAndPermission('escolar', 'administracion-escolar:gestionar', { escritura: true });
  if (!auth.ok) return auth.response;
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: 'No encontrada' }, { status: 404 });
  const body = await req.json().catch(() => null) as { texto?: unknown } | null;
  const v = validarMensaje(body?.texto);
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });
  const ok = await agregarMensaje(auth.teamId, id, { userId: auth.user.id, nombre: autorDe(auth.user) }, v.texto);
  if (!ok) return NextResponse.json({ error: 'No encontrada' }, { status: 404 });
  return NextResponse.json({ ok: true }, { status: 201 });
}
