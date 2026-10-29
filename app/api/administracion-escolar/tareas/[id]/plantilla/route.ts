/**
 * Las plantillas de Soporte IT: el equipo de Zero le avisa al colegio que una
 * tarea quedó resuelta y cerrada, o que la dejó en revisión para que la revise.
 *
 *   POST { plantilla: 'cerrada' | 'revision', texto? }
 *        Escribe el mensaje (el de la plantilla, o el que se editó en
 *        pantalla), cambia el estado y avisa por correo, campana, celular y
 *        Slack a quien creó la tarea, a los participantes y a los dueños del
 *        colegio. El mensaje lleva el enlace a la tarea. «En revisión» además
 *        le pone plazo: si en 24 horas nadie contesta, el cron
 *        `escolar-tareas` la cierra sola.
 *
 * Solo el equipo de Zero (rol de plataforma `admin`): para el colegio, Soporte
 * IT es quien cierra lo que le pidieron.
 */
import { NextRequest, NextResponse, after } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { adminEscolarTareas, users } from '@/lib/db/schema';
import { requireModuleAndPermission } from '@/lib/auth/api-guard';
import {
  agregarMensaje, avisarDeTarea, cambiarEstadoTarea, leerTarea, venceRevisionEn,
} from '@/lib/administracion-escolar/tareas';
import {
  autorTarea, esPlantilla, PLANTILLAS_SOPORTE, primerNombre, validarMensaje,
} from '@/lib/administracion-escolar/tareas-reglas';
import { urlDeTarea } from '@/lib/email/escolar-tareas';
import { logAudit } from '@/lib/audit';

/** El texto de la plantilla para esta tarea: lo pide la pantalla para enseñarlo antes de enviar. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireModuleAndPermission('escolar', 'administracion-escolar:gestionar');
  if (!auth.ok) return auth.response;
  if (auth.user.platformRole !== 'admin') return NextResponse.json({ error: 'Solo Soporte IT' }, { status: 403 });
  const id = Number((await params).id);
  const plantilla = req.nextUrl.searchParams.get('plantilla');
  if (!Number.isInteger(id) || id <= 0 || !esPlantilla(plantilla)) {
    return NextResponse.json({ error: 'No encontrada' }, { status: 404 });
  }
  const nombre = await nombreDeQuienLaCreo(auth.teamId, id);
  if (nombre === undefined) return NextResponse.json({ error: 'No encontrada' }, { status: 404 });
  return NextResponse.json({ texto: PLANTILLAS_SOPORTE[plantilla].texto({ nombre, url: urlDeTarea(id) }) });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireModuleAndPermission('escolar', 'administracion-escolar:gestionar', { escritura: true });
  if (!auth.ok) return auth.response;
  if (auth.user.platformRole !== 'admin') return NextResponse.json({ error: 'Solo Soporte IT' }, { status: 403 });
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: 'No encontrada' }, { status: 404 });

  const body = await req.json().catch(() => null) as { plantilla?: unknown; texto?: unknown } | null;
  if (!esPlantilla(body?.plantilla)) return NextResponse.json({ error: 'Plantilla no válida' }, { status: 400 });
  const p = PLANTILLAS_SOPORTE[body.plantilla];
  const nombre = await nombreDeQuienLaCreo(auth.teamId, id);
  if (nombre === undefined) return NextResponse.json({ error: 'No encontrada' }, { status: 404 });
  const v = validarMensaje(typeof body.texto === 'string' && body.texto.trim()
    ? body.texto : p.texto({ nombre, url: urlDeTarea(id) }));
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });

  const autor = autorTarea(auth.user);
  await agregarMensaje(auth.teamId, id, autor, v.texto);
  // Si ya estaba así (p. ej. ya completada) solo sale el mensaje.
  const cambio = await cambiarEstadoTarea(auth.teamId, id, autor, p.accion);
  if (p.accion === 'revision') await venceRevisionEn(auth.teamId, id);
  after(() => avisarDeTarea(auth.teamId, id, p.accion === 'completar' ? 'completada' : 'revision', autor, v.texto, { duenos: true }));
  logAudit({
    teamId: auth.teamId, userId: auth.user.id, actor: auth.user.email,
    action: p.accion === 'completar' ? 'ESCOLAR_TAREA_COMPLETADA' : 'ESCOLAR_TAREA_EN_REVISION',
    resource: `tarea:${id}`, meta: { plantilla: body.plantilla, cambioEstado: cambio != null },
  });
  return NextResponse.json({ ok: true });
}

/** El primer nombre de quien creó la tarea, `null` si no hay, o `undefined` si la tarea no es de este colegio. */
async function nombreDeQuienLaCreo(teamId: number, id: number): Promise<string | null | undefined> {
  const t = await leerTarea(teamId, id);
  if (!t) return undefined;
  const [f] = await db.select({ name: users.name })
    .from(adminEscolarTareas).leftJoin(users, eq(users.id, adminEscolarTareas.creadaPorUserId))
    .where(eq(adminEscolarTareas.id, id)).limit(1);
  return primerNombre(f?.name);
}
