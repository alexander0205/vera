import { NextResponse } from 'next/server';
import { requireModuleAndPermission } from '@/lib/auth/api-guard';
import { armarLiquidacion, registrarLiquidacion } from '@/lib/nomina/liquidacion-db';
import { hoyRD } from '@/lib/utils/format';
import { logAudit, getIp } from '@/lib/audit';

export const dynamic = 'force-dynamic';

/**
 * POST /api/nomina/empleados/[id]/liquidacion — calcula (y, con `aplicar: true`,
 * registra) la liquidación de un empleado que sale.
 *   { fechaSalida: 'YYYY-MM-DD', motivo, diasVacacionesPendientes?, aplicar? }
 *
 * Sin `aplicar` solo calcula: no escribe nada. Con `aplicar` crea una corrida de
 * liquidación en borrador y da de baja al empleado; si se borra ese borrador, el
 * empleado vuelve a como estaba. Permiso `nomina:correr`.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireModuleAndPermission('nomina', 'nomina:correr');
  if (!auth.ok) return auth.response;

  const { id } = await params;
  if (!/^\d{1,9}$/.test(id)) return NextResponse.json({ error: 'Empleado no encontrado' }, { status: 404 });
  const empleadoId = Number(id);

  const body = await req.json().catch(() => null) as Record<string, unknown> | null;
  if (!body || typeof body !== 'object' || Array.isArray(body)) return NextResponse.json({ error: 'Cuerpo inválido' }, { status: 400 });

  const entrada = {
    fechaSalida: body.fechaSalida, motivo: body.motivo, diasVacacionesPendientes: body.diasVacacionesPendientes, hoy: hoyRD(),
  };

  if (body.aplicar !== true) {
    const r = await armarLiquidacion(auth.teamId, empleadoId, entrada);
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
    return NextResponse.json({ liquidacion: r.liquidacion });
  }

  const r = await registrarLiquidacion(auth.teamId, auth.user.id, empleadoId, entrada);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
  logAudit({
    teamId: auth.teamId, userId: auth.user.id, actor: auth.user.email, action: 'NOMINA_LIQUIDACION_CREADA', ip: getIp(req),
    meta: { empleadoId, corridaId: r.corridaId, motivo: r.liquidacion.motivo, totalCents: r.liquidacion.resultado.totalCents },
  });
  return NextResponse.json({ ok: true, corridaId: r.corridaId, liquidacion: r.liquidacion }, { status: 201 });
}
