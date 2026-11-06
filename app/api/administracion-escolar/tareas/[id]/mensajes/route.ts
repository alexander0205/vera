/**
 * Escribir en la conversación de una tarea.
 *
 *   POST { texto, pasarTurno? } → el mensaje queda firmado por quien lo escribe, y les llega
 *                    por correo a los demás de la tarea (ver `avisarDeTarea`).
 *                    Si le tocaba contestar a quien escribe, la tarea pasa al otro
 *                    lado, salvo que mande `pasarTurno: false` («Enviar sin pasar»)
 */
import { NextRequest, NextResponse, after } from 'next/server';
import { requireModuleAndPermission } from '@/lib/auth/api-guard';
import { agregarMensaje, avisarDeTarea, leerTarea } from '@/lib/administracion-escolar/tareas';
import { resolverMencionesGuardadas } from '@/lib/administracion-escolar/tareas-menciones-servidor';
import { personasDelEquipo } from '@/lib/administracion-escolar/tareas-atiende';
import { firmaVisible } from '@/lib/administracion-escolar/tareas-equipo';
import { textoPlano } from '@/lib/administracion-escolar/tareas-menciones';
import { notificarMenciones } from '@/lib/notificaciones/menciones-tareas';
import { autorTarea, validarMensaje } from '@/lib/administracion-escolar/tareas-reglas';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireModuleAndPermission('escolar', 'administracion-escolar:gestionar', { escritura: true });
  if (!auth.ok) return auth.response;
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: 'No encontrada' }, { status: 404 });
  const body = await req.json().catch(() => null) as { texto?: unknown; pasarTurno?: unknown } | null;
  const v = validarMensaje(body?.texto);
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });
  const autor = autorTarea(auth.user);
  // Las menciones con @ se validan contra el colegio: las que no valen quedan como texto.
  const m = await resolverMencionesGuardadas(auth.teamId, v.texto);
  const ok = await agregarMensaje(auth.teamId, id, autor, m.texto, { pasarTurno: body?.pasarTurno !== false });
  if (!ok) return NextResponse.json({ error: 'No encontrada' }, { status: 404 });
  // Los avisos llevan el texto sin tokens («@Ana · Zero»).
  const plano = textoPlano(m.texto);
  after(async () => {
    await avisarDeTarea(auth.teamId, id, 'mensaje', autor, plano);
    if (m.personas.length > 0) {
      const t = await leerTarea(auth.teamId, id);
      // El colegio lee «Ana · Zero», no la firma genérica del Departamento.
      const persona = autor.esSoporte && autor.userId != null ? (await personasDelEquipo([autor.userId])).get(autor.userId) : null;
      if (t) await notificarMenciones(auth.teamId, m.personas, { tareaId: id, titulo: t.titulo, autor: firmaVisible(autor, persona), texto: plano, autorUserId: autor.userId }, null);
    }
  });
  return NextResponse.json({ ok: true }, { status: 201 });
}
