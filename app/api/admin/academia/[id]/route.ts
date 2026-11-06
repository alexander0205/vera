/** PATCH → edita un video · DELETE → lo borra junto con sus archivos. Solo el administrador de la plataforma. */
import { NextRequest, NextResponse } from 'next/server';
import { origenValido, requirePlatformAdmin } from '@/lib/auth/admin-guard';
import { borrarVideo, guardarVideo } from '@/lib/academia/admin';

async function idDe(params: Promise<{ id: string }>): Promise<number | null> {
  const id = Number((await params).id);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const a = await requirePlatformAdmin();
  if (!a.ok) return a.response;
  if (!origenValido(req)) return NextResponse.json({ error: 'Origen no permitido' }, { status: 403 });
  const id = await idDe(params);
  if (!id) return NextResponse.json({ error: 'No encontrado' }, { status: 404 });
  const r = await guardarVideo(id, await req.json().catch(() => null));
  return r.ok ? NextResponse.json({ video: r.video }) : NextResponse.json({ error: r.error }, { status: r.status });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const a = await requirePlatformAdmin();
  if (!a.ok) return a.response;
  if (!origenValido(req)) return NextResponse.json({ error: 'Origen no permitido' }, { status: 403 });
  const id = await idDe(params);
  if (!id) return NextResponse.json({ error: 'No encontrado' }, { status: 404 });
  return (await borrarVideo(id))
    ? NextResponse.json({ ok: true })
    : NextResponse.json({ error: 'No encontrado' }, { status: 404 });
}
