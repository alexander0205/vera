/**
 * El corrector de las tareas.
 *
 *   POST { modo: 'corregir' | 'mejorar' | 'redactar', texto } → { texto }
 *
 * Devuelve el texto y no escribe nada en la tarea: lo envía una persona después
 * de revisarlo. Solo el equipo de Zero (rol de plataforma `admin`), igual que
 * las plantillas del Departamento de IT.
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireModuleAndPermission } from '@/lib/auth/api-guard';
import { leerTarea } from '@/lib/administracion-escolar/tareas';
import { redactarEnTarea } from '@/lib/administracion-escolar/tareas-redaccion';
import { esModoRedaccion, MODOS_REDACCION, validarMensaje } from '@/lib/administracion-escolar/tareas-reglas';

export const maxDuration = 60;

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireModuleAndPermission('escolar', 'administracion-escolar:gestionar', { escritura: true });
  if (!auth.ok) return auth.response;
  if (auth.user.platformRole !== 'admin') return NextResponse.json({ error: 'Solo el Departamento de IT de Zero' }, { status: 403 });
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: 'No encontrada' }, { status: 404 });

  const body = await req.json().catch(() => ({})) as { modo?: unknown; texto?: unknown };
  if (!esModoRedaccion(body.modo)) return NextResponse.json({ error: 'No sé hacer eso con el texto' }, { status: 400 });
  const escrito = typeof body.texto === 'string' ? body.texto.trim() : '';
  let borrador = '';
  if (escrito || MODOS_REDACCION[body.modo].necesitaTexto) {
    const v = validarMensaje(escrito);
    if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });
    borrador = v.texto;
  }

  const tarea = await leerTarea(auth.teamId, id);
  if (!tarea) return NextResponse.json({ error: 'No encontrada' }, { status: 404 });

  try {
    const texto = await redactarEnTarea({
      teamId: auth.teamId, userId: auth.user.id, modo: body.modo,
      titulo: tarea.titulo, borrador, mensajes: tarea.mensajes,
    });
    if (texto == null) return NextResponse.json({ error: 'El corrector no está disponible ahora mismo.' }, { status: 503 });
    return NextResponse.json({ texto });
  } catch (e) {
    console.error('[tareas] el corrector falló', e instanceof Error ? e.message : e);
    return NextResponse.json({ error: 'El corrector no pudo con este texto. Intenta otra vez.' }, { status: 502 });
  }
}
