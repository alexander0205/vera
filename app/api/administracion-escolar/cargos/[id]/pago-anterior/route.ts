import { NextRequest, NextResponse } from 'next/server';
import { requireModuleAndPermission } from '@/lib/auth/api-guard';
import { logAudit } from '@/lib/audit';
import { PagoAnteriorError, registrarPagoAnterior } from '@/lib/administracion-escolar/pago-anterior';

/**
 * POST /api/administracion-escolar/cargos/[id]/pago-anterior
 *   { pagadoCentavos, fechaPago, metodo, ncf? }
 *
 * Anota lo que la familia pagó de este cargo antes de usar Zero (la migración
 * de un colegio): factura histórica por el monto del cargo, su pago y el cargo
 * atado a ella. Ver `pago-anterior.ts`.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireModuleAndPermission('escolar', 'administracion-escolar:pagos', { escritura: true });
  if (!auth.ok) return auth.response;
  const { teamId, user } = auth;
  const { id } = await params;
  const cargoId = Number(id);
  if (!Number.isInteger(cargoId) || cargoId <= 0) {
    return NextResponse.json({ error: 'Cargo inválido' }, { status: 400 });
  }

  const body = await req.json().catch(() => ({}));
  try {
    const r = await registrarPagoAnterior(teamId, user.id, cargoId, {
      pagadoCentavos: Math.round(Number(body.pagadoCentavos)),
      fechaPago: String(body.fechaPago ?? ''),
      metodo: String(body.metodo ?? ''),
      ncf: typeof body.ncf === 'string' && body.ncf.trim() ? body.ncf : null,
    });
    logAudit({
      teamId, userId: user.id, actor: user.email, action: 'PAGO_REGISTRADO',
      resource: `cargo:${cargoId}`,
      meta: { tipo: 'pago_anterior_migracion', ecfDocumentId: r.ecfDocumentId, encf: r.encf, pagadoCentavos: body.pagadoCentavos },
    });
    return NextResponse.json(r);
  } catch (err) {
    if (err instanceof PagoAnteriorError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
}
