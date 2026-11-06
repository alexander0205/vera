/**
 * POST /api/escolar/inventario-aula/trasladar — mueve unidades de un activo a otra
 * aula: { activoId, espacioDestinoId, unidades, nota? }. Si se mueven todas cambia
 * el aula de la ficha; si se mueve una parte, la ficha se divide en dos con el
 * costo, el residual y la depreciación repartidos en centavos exactos (sin asientos
 * nuevos). Requiere `administracion-escolar:gestionar`.
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireModuleAndPermission } from '@/lib/auth/api-guard';
import { logAudit, getIp } from '@/lib/audit';
import { invalidarPlanta } from '@/lib/cache/escolar';
import { trasladarUnidades } from '@/lib/escolar/inventario-aula-db';
import { responderError, enteroPositivo } from '@/lib/escolar/inventario-aula-api';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const auth = await requireModuleAndPermission('escolar', 'administracion-escolar:gestionar', { escritura: true });
  if (!auth.ok) return auth.response;
  const b = await req.json().catch(() => null) as Record<string, unknown> | null;
  if (!b || typeof b !== 'object') return NextResponse.json({ error: 'Cuerpo inválido' }, { status: 400 });

  const activoId = enteroPositivo(b.activoId);
  const espacioDestinoId = enteroPositivo(b.espacioDestinoId);
  const unidades = enteroPositivo(b.unidades);
  if (!activoId || !espacioDestinoId) return NextResponse.json({ error: 'Elige el activo y el aula de destino' }, { status: 400 });
  if (!unidades) return NextResponse.json({ error: 'Indica cuántas unidades se mueven (al menos una)' }, { status: 400 });

  try {
    const r = await trasladarUnidades({
      teamId: auth.teamId, userId: auth.user.id, activoId, espacioDestinoId, unidades,
      nota: typeof b.nota === 'string' ? b.nota : null,
    });
    invalidarPlanta(auth.teamId);
    logAudit({
      teamId: auth.teamId, userId: auth.user.id, actor: auth.user.email, action: 'ESCOLAR_ACTIVO_TRASLADO',
      resource: `activo:${activoId}`, ip: getIp(req), meta: { espacioDestinoId, unidades, ...r },
    });
    return NextResponse.json({ ok: true, ...r });
  } catch (e) {
    return responderError(e);
  }
}
