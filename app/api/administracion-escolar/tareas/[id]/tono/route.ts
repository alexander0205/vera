/**
 * La revisión del tono antes de enviar.
 *
 *   POST { texto } → { riesgo, motivo, sugerencia }
 *
 * No escribe nada en la tarea. Solo el equipo de Zero (rol de plataforma
 * `admin`); el colegio no pasa por aquí. NUNCA bloquea: si no hay llave, el
 * modelo falla o tarda más de 3 segundos, contesta «sin riesgo» con 200 y el
 * mensaje se envía normal.
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireModuleAndPermission } from '@/lib/auth/api-guard';
import { revisarTono } from '@/lib/administracion-escolar/tareas-tono';
import { SIN_RIESGO } from '@/lib/administracion-escolar/tareas-tono-reglas';
import { validarMensaje } from '@/lib/administracion-escolar/tareas-reglas';

export const maxDuration = 10;

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireModuleAndPermission('escolar', 'administracion-escolar:gestionar', { escritura: true });
  if (!auth.ok) return auth.response;
  if (auth.user.platformRole !== 'admin') return NextResponse.json({ error: 'Solo el Departamento de IT de Zero' }, { status: 403 });
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: 'No encontrada' }, { status: 404 });
  const body = await req.json().catch(() => null) as { texto?: unknown } | null;
  const v = validarMensaje(body?.texto);
  // Un borrador vacío o enorme no se revisa, y tampoco se frena: la pantalla decide qué hacer con él.
  if (!v.ok) return NextResponse.json(SIN_RIESGO);
  return NextResponse.json(await revisarTono({ teamId: auth.teamId, userId: auth.user.id, borrador: v.texto }));
}
