/**
 * POST /api/escolar/inventario-aula/activos — agrega un activo desde la pantalla de
 * un aula, con el aula ya elegida. Es la misma creación de ficha de contabilidad:
 *   { espacioId, nombre, costoPesos, valorResidualPesos?, vidaUtilMeses?, fechaAdquisicion,
 *     cantidad?, categoria?, soloControl?, estado? }
 * Requiere `administracion-escolar:configurar` (crea una ficha contable).
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireModuleAndPermission } from '@/lib/auth/api-guard';
import { logAudit, getIp } from '@/lib/audit';
import { invalidarPlanta } from '@/lib/cache/escolar';
import { parseMontoPesos, fechaRazonable } from '@/lib/contabilidad/montos';
import { crearActivoEnAula } from '@/lib/escolar/inventario-aula-db';
import { responderError, enteroPositivo } from '@/lib/escolar/inventario-aula-api';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const auth = await requireModuleAndPermission('escolar', 'administracion-escolar:configurar', { escritura: true });
  if (!auth.ok) return auth.response;
  const b = await req.json().catch(() => null) as Record<string, unknown> | null;
  if (!b || typeof b !== 'object') return NextResponse.json({ error: 'Cuerpo inválido' }, { status: 400 });

  const espacioId = enteroPositivo(b.espacioId);
  if (!espacioId) return NextResponse.json({ error: 'Elige el aula' }, { status: 400 });
  const costo = parseMontoPesos(b.costoPesos, 'El costo');
  if (!costo.ok) return NextResponse.json({ error: costo.error }, { status: 400 });
  let residual = 0;
  if (b.valorResidualPesos !== undefined && b.valorResidualPesos !== '' && b.valorResidualPesos !== 0 && b.valorResidualPesos !== '0') {
    const r = parseMontoPesos(b.valorResidualPesos, 'El valor residual');
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });
    residual = r.cents;
  }
  if (!fechaRazonable(b.fechaAdquisicion)) return NextResponse.json({ error: 'La fecha de adquisición no es válida' }, { status: 400 });

  try {
    const id = await crearActivoEnAula(auth.teamId, auth.user.id, espacioId, {
      nombre: String(b.nombre ?? ''),
      costoCents: costo.cents,
      valorResidualCents: residual,
      vidaUtilMeses: Number(b.vidaUtilMeses ?? 0),
      fechaAdquisicion: b.fechaAdquisicion,
      cantidad: b.cantidad === undefined || b.cantidad === '' ? 1 : Number(b.cantidad),
      categoria: typeof b.categoria === 'string' && b.categoria ? b.categoria : null,
      soloControl: b.soloControl === true,
      estado: typeof b.estado === 'string' ? b.estado : undefined,
    });
    invalidarPlanta(auth.teamId);
    logAudit({ teamId: auth.teamId, userId: auth.user.id, actor: auth.user.email, action: 'ESCOLAR_ESPACIO_CAMBIO', resource: `activo:${id}`, ip: getIp(req), meta: { cambio: 'activo-creado', espacioId } });
    return NextResponse.json({ ok: true, id });
  } catch (e) {
    return responderError(e);
  }
}
