/**
 * Los dos botones rápidos de quien tomó la tarea cuando le toca contestar:
 *
 *   POST { tipo: 'sigo' }                          → «Sigo trabajando en ello»
 *   POST { tipo: 'mas_tiempo', hasta: ISO }        → «Esto tomará más tiempo», para esa fecha
 *
 * Escriben un mensaje al otro lado SIN pasarle la tarea y reinician el reloj
 * de la alerta de 2 horas; el segundo además la deja en pausa hasta esa hora.
 */
import { NextRequest, NextResponse, after } from 'next/server';
import { requireModuleAndPermission } from '@/lib/auth/api-guard';
import { avisarDeTarea, registrarSeguimiento } from '@/lib/administracion-escolar/tareas';
import { autorTarea, esSeguimiento, textoSeguimiento, validarPausa } from '@/lib/administracion-escolar/tareas-reglas';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireModuleAndPermission('escolar', 'administracion-escolar:gestionar', { escritura: true });
  if (!auth.ok) return auth.response;
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: 'No encontrada' }, { status: 404 });
  const body = await req.json().catch(() => null) as { tipo?: unknown; hasta?: unknown } | null;
  if (!esSeguimiento(body?.tipo)) return NextResponse.json({ error: 'Acción no válida' }, { status: 400 });
  let hasta: Date | null = null;
  if (body.tipo === 'mas_tiempo') {
    const p = validarPausa(body.hasta);
    if (!p.ok) return NextResponse.json({ error: p.error }, { status: 400 });
    hasta = p.fecha;
  }
  const autor = autorTarea(auth.user);
  const r = await registrarSeguimiento(auth.teamId, id, autor, body.tipo, hasta);
  if (r === 'no_existe') return NextResponse.json({ error: 'No encontrada' }, { status: 404 });
  if (r === 'no_toca') return NextResponse.json({ error: 'Ahora no te toca contestar esta tarea.' }, { status: 409 });
  if (r === 'no_la_tomo') return NextResponse.json({ error: 'Solo quien tomó la tarea puede usar este botón.' }, { status: 403 });
  const texto = body.tipo === 'mas_tiempo' && hasta ? textoSeguimiento.mas_tiempo(hasta) : textoSeguimiento.sigo();
  after(() => avisarDeTarea(auth.teamId, id, 'mensaje', autor, texto));
  return NextResponse.json({ ok: true }, { status: 201 });
}
