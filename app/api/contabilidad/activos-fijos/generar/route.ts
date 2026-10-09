/**
 * POST /api/contabilidad/activos-fijos/generar — genera las depreciaciones
 * pendientes del team a mano (Nivel 4.2). El mismo trabajo lo hace el cron; este
 * botón es para "quiero verlo ahora". Idempotente. Requiere `contabilidad:gestionar`.
 */

import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth/api-guard';
import {
  generarDepreciacionesPendientes, DepreciacionSinCuentaError,
} from '@/lib/contabilidad/depreciacion';

export async function POST() {
  const auth = await requirePermission('contabilidad:gestionar');
  if (!auth.ok) return auth.response;

  try {
    const resumen = await generarDepreciacionesPendientes(auth.teamId, auth.user.id);
    return NextResponse.json({ ok: true, ...resumen });
  } catch (e) {
    if (e instanceof DepreciacionSinCuentaError) {
      return NextResponse.json({ error: e.message }, { status: 409 });
    }
    throw e;
  }
}
