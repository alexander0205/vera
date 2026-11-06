/**
 * POST /api/escolar/espacios/arranque — crea un aula por cada sección vigente que
 * todavía no tiene espacio. Idempotente. Requiere `administracion-escolar:configurar`.
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireModuleAndPermission } from '@/lib/auth/api-guard';
import { logAudit, getIp } from '@/lib/audit';
import { invalidarPlanta } from '@/lib/cache/escolar';
import { crearAulaPorSeccion } from '@/lib/escolar/inventario-aula-db';
import { responderError } from '@/lib/escolar/inventario-aula-api';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const auth = await requireModuleAndPermission('escolar', 'administracion-escolar:configurar', { escritura: true });
  if (!auth.ok) return auth.response;
  try {
    const r = await crearAulaPorSeccion(auth.teamId);
    invalidarPlanta(auth.teamId);
    logAudit({ teamId: auth.teamId, userId: auth.user.id, actor: auth.user.email, action: 'ESCOLAR_ESPACIO_CAMBIO', resource: 'espacios:arranque', ip: getIp(req), meta: { creadas: r.creadas } });
    return NextResponse.json({ ok: true, ...r });
  } catch (e) {
    return responderError(e);
  }
}
