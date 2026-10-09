/**
 * GET  → salud del canal de WhatsApp del colegio
 * POST → vuelve a preguntar los acuses ahora mismo
 *
 * Existe porque el 201 del envío no dice nada sobre si el mensaje llegó, y un
 * canal roto se ve exactamente igual que uno sano hasta que alguien pregunta.
 */

import { NextResponse } from 'next/server';
import { requireModuleAndPermission } from '@/lib/auth/api-guard';
import { getSaludCanal } from '@/lib/whatsapp/estado';
import { reconciliarEntregas } from '@/lib/administracion-escolar/entregas';

export async function GET() {
  const auth = await requireModuleAndPermission('escolar', 'administracion-escolar:ver');
  if (!auth.ok) return auth.response;
  return NextResponse.json(await getSaludCanal(auth.teamId));
}

export async function POST() {
  const auth = await requireModuleAndPermission('escolar', 'administracion-escolar:configurar');
  if (!auth.ok) return auth.response;
  try {
    const r = await reconciliarEntregas(auth.teamId);
    return NextResponse.json({ ok: true, ...r, salud: await getSaludCanal(auth.teamId) });
  } catch (e) {
    console.error('[whatsapp-salud]', e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'No se pudo revisar las entregas' },
      { status: 502 },
    );
  }
}
