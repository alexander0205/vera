import { NextRequest, NextResponse } from 'next/server';
import { requireCallParticipant } from '@/lib/auth/zero-tickets-call-guard';
import { s3Disponible, construirKeyGrabacion, subirAdjuntoTicket } from '@/lib/storage/tickets';
import { db } from '@/lib/db/drizzle';
import { ticketCallRecordings } from '@/lib/db/schema';

const MAX_BYTES = 200 * 1024 * 1024; // 200MB — de sobra para un segmento de llamada

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const callId = parseInt(id, 10);
  if (Number.isNaN(callId)) return NextResponse.json({ error: 'ID inválido' }, { status: 400 });

  const rolParam = req.nextUrl.searchParams.get('role');
  if (rolParam !== 'user' && rolParam !== 'agent') {
    return NextResponse.json({ error: 'role inválido' }, { status: 400 });
  }

  const auth = await requireCallParticipant(callId, rolParam);
  if (!auth.ok) return auth.response;

  // Sin S3 configurado no hay dónde guardar el blob — se descarta en vez de
  // caer a base64 en Postgres (ese fallback ya causó una latencia de 100+s
  // en este mismo proyecto para adjuntos de tickets). Grabar es un extra de
  // la llamada, no su propósito: que falte no debe romper nada.
  if (!s3Disponible()) {
    return NextResponse.json({ ok: true, skipped: true });
  }

  const form = await req.formData();
  const file = form.get('file');
  const duracionRaw = form.get('duracionSegundos');
  if (!(file instanceof File)) return NextResponse.json({ error: 'Falta el archivo' }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: 'Archivo muy grande' }, { status: 400 });
  const duracionSegundos = typeof duracionRaw === 'string' ? parseInt(duracionRaw, 10) : NaN;
  if (Number.isNaN(duracionSegundos) || duracionSegundos < 0) {
    return NextResponse.json({ error: 'duracionSegundos inválido' }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const key = construirKeyGrabacion(callId, auth.role);

  try {
    // Un segmento grabado sin pantalla compartida es audio/webm, no
    // video/webm: si se sube con el tipo equivocado el navegador después
    // intenta abrirlo como video y muestra un cuadro negro en vez de un
    // reproductor de audio.
    const tipo = file.type === 'audio/webm' || file.type.startsWith('audio/webm;') ? 'audio/webm' : 'video/webm';
    await subirAdjuntoTicket(key, buffer, tipo);
    await db.insert(ticketCallRecordings).values({ callId, role: auth.role, s3Key: key, duracionSegundos });
  } catch (err) {
    console.error('[zero-tickets/calls/[id]/grabacion POST]', err);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
