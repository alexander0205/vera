/**
 * «Tomar la tarea»: quien la toma será quien conteste por su lado (el colegio o
 * el equipo de Zero). Antes de responder, la pantalla pide tomarla si nadie de
 * ese lado lo ha hecho.
 *
 *   POST → 201 { ok, ya } y una línea en la conversación («Ana · Zero tomó la tarea»);
 *          200 si ya era suya; 409 si otra persona de su lado la había tomado
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireModuleAndPermission } from '@/lib/auth/api-guard';
import { tomarTarea } from '@/lib/administracion-escolar/tareas';
import { autorTarea } from '@/lib/administracion-escolar/tareas-reglas';
import { logAudit } from '@/lib/audit';

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireModuleAndPermission('escolar', 'administracion-escolar:gestionar', { escritura: true });
  if (!auth.ok) return auth.response;
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: 'No encontrada' }, { status: 404 });
  const r = await tomarTarea(auth.teamId, id, autorTarea(auth.user));
  if (r === null) return NextResponse.json({ error: 'No encontrada' }, { status: 404 });
  if (r === 'ocupada') return NextResponse.json({ error: 'Otra persona de tu equipo ya tomó esta tarea.' }, { status: 409 });
  if (r === 'nueva') {
    logAudit({ teamId: auth.teamId, userId: auth.user.id, actor: auth.user.email, action: 'ESCOLAR_TAREA_TOMADA', resource: `tarea:${id}` });
  }
  return NextResponse.json({ ok: true, ya: r === 'ya_suya' }, { status: r === 'nueva' ? 201 : 200 });
}
