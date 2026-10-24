/**
 * Zero AI revisa los cargos y las facturas del colegio y abre una tarea por
 * cada cosa que hay que decidir.
 *
 *   POST → { encontradas, nuevas }
 *
 * Revisar dos veces no repite tareas (ver lib/administracion-escolar/tareas-ia.ts).
 */
import { NextResponse } from 'next/server';
import { requireModuleAndPermission } from '@/lib/auth/api-guard';
import { revisarConZeroAi } from '@/lib/administracion-escolar/tareas-ia';
import { logAudit } from '@/lib/audit';

export async function POST() {
  const auth = await requireModuleAndPermission('escolar', 'administracion-escolar:gestionar', { escritura: true });
  if (!auth.ok) return auth.response;
  const r = await revisarConZeroAi(auth.teamId);
  logAudit({
    teamId: auth.teamId, userId: auth.user.id, actor: auth.user.email, action: 'ESCOLAR_TAREAS_ZERO_AI',
    meta: { ...r },
  });
  return NextResponse.json(r);
}
