/**
 * POST /api/contabilidad/cierre-ejercicio/reabrir { ejercicio }
 * Reabre un ejercicio cerrado (borra su asiento de cierre). contabilidad:gestionar.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth/api-guard';
import { reabrirEjercicio, CierreError } from '@/lib/contabilidad/cierre';

export async function POST(req: NextRequest) {
  const auth = await requirePermission('contabilidad:gestionar');
  if (!auth.ok) return auth.response;

  let body: { ejercicio?: unknown };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Cuerpo inválido' }, { status: 400 }); }

  const n = Number(body.ejercicio);
  if (!Number.isInteger(n)) return NextResponse.json({ error: 'Año inválido' }, { status: 400 });

  try {
    await reabrirEjercicio(auth.teamId, n);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof CierreError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
}
