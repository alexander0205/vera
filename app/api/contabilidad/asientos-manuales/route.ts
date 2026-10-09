/**
 * POST /api/contabilidad/asientos-manuales — registra un asiento a mano.
 *
 * Es POST, nunca efecto de un GET: escribe contabilidad, y una recarga o un
 * prefetch no deben poder dispararlo. Requiere `contabilidad:gestionar`.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth/api-guard';
import {
  generarAsientoManual, AsientoManualError, type LineaManualInput,
} from '@/lib/contabilidad/asientos';

export async function POST(req: NextRequest) {
  const auth = await requirePermission('contabilidad:gestionar');
  if (!auth.ok) return auth.response;

  let body: { fecha?: string; concepto?: string; lineas?: LineaManualInput[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Cuerpo inválido' }, { status: 400 });
  }

  try {
    const { asientoId } = await generarAsientoManual(
      auth.teamId,
      {
        fecha: String(body.fecha ?? ''),
        concepto: String(body.concepto ?? ''),
        lineas: Array.isArray(body.lineas) ? body.lineas : [],
      },
      auth.user.id,
    );
    return NextResponse.json({ ok: true, asientoId });
  } catch (e) {
    if (e instanceof AsientoManualError) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    throw e;
  }
}
