/**
 * Subir una foto, un video o un documento a la conversación de una tarea.
 *
 *   POST { nombre, bytes } → { adjuntoId, trozo }
 *        Abre la subida. Después el navegador manda el archivo en trozos de
 *        `trozo` bytes a `/adjuntos/[adjuntoId]` (ver esa ruta).
 *
 * El tipo no se le cree al navegador: sale de la extensión (`validarAdjunto`).
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireModuleAndPermission } from '@/lib/auth/api-guard';
import { crearAdjunto } from '@/lib/administracion-escolar/tareas';
import { validarAdjunto } from '@/lib/administracion-escolar/tareas-reglas';
import { construirKeyTarea, s3Disponible, TAMANO_TROZO } from '@/lib/storage/tareas';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireModuleAndPermission('escolar', 'administracion-escolar:gestionar', { escritura: true });
  if (!auth.ok) return auth.response;
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: 'No encontrada' }, { status: 404 });
  if (!s3Disponible()) {
    return NextResponse.json({ error: 'Los archivos no están disponibles en este ambiente.' }, { status: 503 });
  }
  const v = validarAdjunto(await req.json().catch(() => null));
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });
  const adjuntoId = await crearAdjunto(auth.teamId, id, auth.user.id, v.adjunto, construirKeyTarea(auth.teamId, v.adjunto.extension));
  if (!adjuntoId) return NextResponse.json({ error: 'No encontrada' }, { status: 404 });
  return NextResponse.json({ adjuntoId, trozo: TAMANO_TROZO }, { status: 201 });
}
