/**
 * POST /api/administracion-escolar/cargos/prefill-factura  { cargoIds: number[] }
 *
 * Lo que el modal de facturar necesita para pintarse: el alumno, el tutor al
 * que se le va a cobrar, y TODOS los cargos cobrables de esa matrícula —los que
 * se pidieron marcados, el resto para poder añadirlos.
 *
 * No crea ni emite nada. La factura se arma después contra /api/ecf/emitir, que
 * es el mismo camino que usa el formulario grande.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireModuleAndPermission } from '@/lib/auth/api-guard';
import { prefillDeCargos } from '@/lib/administracion-escolar/prefill-factura';

export async function POST(req: NextRequest) {
  // 'pagos' y no 'ver': la respuesta lleva los datos fiscales del tutor
  // responsable (RNC, email, teléfono) para armar la factura.
  const auth = await requireModuleAndPermission('escolar', 'administracion-escolar:pagos');
  if (!auth.ok) return auth.response;

  const body = await req.json().catch(() => ({}));
  const crudos: unknown = body.cargoIds;
  if (!Array.isArray(crudos)) {
    return NextResponse.json({ error: 'cargoIds debe ser una lista' }, { status: 400 });
  }
  const cargoIds = [...new Set(crudos.map(Number))].filter((n) => Number.isInteger(n) && n > 0);

  // Una cuota que todavía no es cargo. Se manda así, sin crearla: la deuda no
  // debe existir hasta que exista la factura.
  let previsto;
  if (body.previsto) {
    const m = Number(body.previsto.matriculaId);
    const c = Number(body.previsto.cuotaId);
    const k = Number(body.previsto.conceptoId);
    if (![m, c, k].every((n) => Number.isInteger(n) && n > 0)) {
      return NextResponse.json({ error: 'previsto inválido' }, { status: 400 });
    }
    previsto = { matriculaId: m, cuotaId: c, conceptoId: k };
  }

  if (cargoIds.length === 0 && !previsto) {
    return NextResponse.json({ error: 'cargoIds vacío o inválido' }, { status: 400 });
  }

  const res = await prefillDeCargos(auth.teamId, cargoIds, previsto);
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: res.status });
  return NextResponse.json(res.datos);
}
