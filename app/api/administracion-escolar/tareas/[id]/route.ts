/**
 * Una tarea por revisar con su conversación.
 *
 *   GET                                  → la tarea y sus mensajes (`soporte`: quien mira es
 *                                          del equipo de Zero y ve las plantillas)
 *   PATCH { accion: 'completar' | 'revision' | 'reabrir' } → la marca; deja su línea en la conversación
 */
import { NextRequest, NextResponse, after } from 'next/server';
import { requireModuleAndPermission } from '@/lib/auth/api-guard';
import { avisarDeTarea, cambiarEstadoTarea, leerTarea } from '@/lib/administracion-escolar/tareas';
import { autorTarea, DESTINO, type AccionEstado, type AvisoTarea } from '@/lib/administracion-escolar/tareas-reglas';
import { logAudit } from '@/lib/audit';

const idDe = (v: string) => {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : null;
};

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireModuleAndPermission('escolar', 'administracion-escolar:ver');
  if (!auth.ok) return auth.response;
  const id = idDe((await params).id);
  const tarea = id ? await leerTarea(auth.teamId, id) : null;
  if (!tarea) return NextResponse.json({ error: 'No encontrada' }, { status: 404 });
  return NextResponse.json({ tarea, yo: auth.user.id, soporte: auth.user.platformRole === 'admin' });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireModuleAndPermission('escolar', 'administracion-escolar:gestionar', { escritura: true });
  if (!auth.ok) return auth.response;
  const id = idDe((await params).id);
  if (!id) return NextResponse.json({ error: 'No encontrada' }, { status: 404 });
  const body = await req.json().catch(() => null) as { accion?: unknown } | null;
  const accion = body?.accion as AccionEstado;
  if (!Object.hasOwn(DESTINO, accion)) return NextResponse.json({ error: 'Acción no válida' }, { status: 400 });
  const autor = autorTarea(auth.user);
  const hecho = await cambiarEstadoTarea(auth.teamId, id, autor, accion);
  if (!hecho) return NextResponse.json({ error: 'La tarea no existe o ya estaba así.' }, { status: 409 });
  const aviso: AvisoTarea = accion === 'completar' ? 'completada' : accion === 'revision' ? 'revision' : 'reabierta';
  after(() => avisarDeTarea(auth.teamId, id, aviso, autor, null));
  logAudit({
    teamId: auth.teamId, userId: auth.user.id, actor: auth.user.email,
    action: accion === 'completar' ? 'ESCOLAR_TAREA_COMPLETADA'
      : accion === 'revision' ? 'ESCOLAR_TAREA_EN_REVISION' : 'ESCOLAR_TAREA_REABIERTA',
    resource: `tarea:${id}`,
  });
  return NextResponse.json({ ok: true });
}
