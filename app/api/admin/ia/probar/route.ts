/**
 * POST /api/admin/ia/probar { id } → ¿este modelo contesta con la llave de este despliegue?
 *
 * Una llamada de pocos tokens. Sirve para saber, antes de escogerlo, si Claude
 * está disponible o si el AI Gateway sigue en plan gratuito (403).
 */
import { NextRequest, NextResponse } from 'next/server';
import { requirePlatformAdmin } from '@/lib/auth/admin-guard';
import { esModeloConocido } from '@/lib/ia/modelos';
import { probarModelo } from '@/lib/ia/modelo-servidor';

export const maxDuration = 30;

export async function POST(req: NextRequest) {
  const a = await requirePlatformAdmin();
  if (!a.ok) return a.response;
  const { id } = (await req.json().catch(() => ({}))) as { id?: unknown };
  if (!esModeloConocido(id)) return NextResponse.json({ error: 'Modelo desconocido' }, { status: 400 });
  return NextResponse.json(await probarModelo(id));
}
