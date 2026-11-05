/** POST { videoId, avanceSeg, visto } → guarda hasta dónde llegó la persona en un video. */
import { NextRequest, NextResponse } from 'next/server';
import { getUser } from '@/lib/db/queries';
import { origenValido } from '@/lib/auth/admin-guard';
import { guardarProgreso } from '@/lib/academia/datos';

export async function POST(req: NextRequest) {
  if (!origenValido(req)) return NextResponse.json({ ok: false }, { status: 403 });
  const user = await getUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });
  const b = (await req.json().catch(() => null)) as { videoId?: unknown; avanceSeg?: unknown; visto?: unknown } | null;
  const videoId = Number(b?.videoId);
  const avance = Number(b?.avanceSeg);
  if (!Number.isInteger(videoId) || videoId <= 0 || !Number.isFinite(avance)) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  return NextResponse.json({ ok: await guardarProgreso(user.id, videoId, avance, b?.visto === true) });
}
