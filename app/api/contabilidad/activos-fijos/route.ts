/**
 * POST /api/contabilidad/activos-fijos — registra un activo fijo (Nivel 4.2).
 *
 * Es POST, nunca efecto de un GET: escribe. Requiere `contabilidad:gestionar`.
 * El listado se renderiza en la página (server), sin API, como los reportes.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth/api-guard';
import { registrarActivoFijo, ActivoFijoError } from '@/lib/contabilidad/depreciacion';

export async function POST(req: NextRequest) {
  const auth = await requirePermission('contabilidad:gestionar');
  if (!auth.ok) return auth.response;

  let body: {
    nombre?: string; costoCents?: number; valorResidualCents?: number;
    vidaUtilMeses?: number; fechaAdquisicion?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Cuerpo inválido' }, { status: 400 });
  }

  try {
    const id = await registrarActivoFijo(
      auth.teamId,
      {
        nombre: String(body.nombre ?? ''),
        costoCents: Number(body.costoCents ?? 0),
        valorResidualCents: Number(body.valorResidualCents ?? 0),
        vidaUtilMeses: Number(body.vidaUtilMeses ?? 0),
        fechaAdquisicion: String(body.fechaAdquisicion ?? ''),
      },
      auth.user.id,
    );
    return NextResponse.json({ ok: true, id });
  } catch (e) {
    if (e instanceof ActivoFijoError) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    throw e;
  }
}
