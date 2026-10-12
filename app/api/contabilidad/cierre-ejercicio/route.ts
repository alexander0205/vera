/**
 * Cierre de ejercicio (cierre anual).
 *   GET  ?ejercicio=YYYY → previsualiza qué se cerraría (contabilidad:ver).
 *   POST { ejercicio }   → cierra el ejercicio (contabilidad:gestionar).
 */

import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth/api-guard';
import { previsualizarCierre, cerrarEjercicio, CierreError } from '@/lib/contabilidad/cierre';

function parseEjercicio(v: unknown): number | null {
  const n = Number(v);
  return Number.isInteger(n) && n >= 2000 && n <= 2100 ? n : null;
}

export async function GET(req: NextRequest) {
  const auth = await requirePermission('contabilidad:ver');
  if (!auth.ok) return auth.response;

  const ejercicio = parseEjercicio(new URL(req.url).searchParams.get('ejercicio'));
  if (ejercicio === null) return NextResponse.json({ error: 'Año inválido' }, { status: 400 });

  return NextResponse.json(await previsualizarCierre(auth.teamId, ejercicio));
}

export async function POST(req: NextRequest) {
  const auth = await requirePermission('contabilidad:gestionar');
  if (!auth.ok) return auth.response;

  let body: { ejercicio?: unknown };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Cuerpo inválido' }, { status: 400 }); }

  const ejercicio = parseEjercicio(body.ejercicio);
  if (ejercicio === null) return NextResponse.json({ error: 'Año inválido' }, { status: 400 });

  try {
    const r = await cerrarEjercicio(auth.teamId, ejercicio, auth.user.id);
    return NextResponse.json({ ok: true, ...r });
  } catch (e) {
    if (e instanceof CierreError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
}
