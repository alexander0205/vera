/**
 * Administración de los videos de la Academia (solo el administrador de la plataforma).
 *
 *   GET  → { videos }        todos, con borradores y con la transcripción como texto
 *   POST → { video }         crea uno
 */
import { NextRequest, NextResponse } from 'next/server';
import { origenValido, requirePlatformAdmin } from '@/lib/auth/admin-guard';
import { guardarVideo, listarParaAdmin } from '@/lib/academia/admin';

export async function GET() {
  const a = await requirePlatformAdmin();
  if (!a.ok) return a.response;
  try {
    return NextResponse.json({ videos: await listarParaAdmin() });
  } catch (e) {
    console.error('[admin/academia] no se pudo leer:', e instanceof Error ? e.message : e);
    return NextResponse.json({ error: 'No se pudo leer la Academia. ¿Corriste la migración 0240?' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const a = await requirePlatformAdmin();
  if (!a.ok) return a.response;
  if (!origenValido(req)) return NextResponse.json({ error: 'Origen no permitido' }, { status: 403 });
  const r = await guardarVideo(null, await req.json().catch(() => null));
  return r.ok ? NextResponse.json({ video: r.video }, { status: 201 }) : NextResponse.json({ error: r.error }, { status: r.status });
}
