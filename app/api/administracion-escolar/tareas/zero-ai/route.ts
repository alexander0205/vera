/**
 * Zero AI revisa los cargos y las facturas del colegio y abre una tarea por
 * cada cosa que hay que decidir.
 *
 *   POST → { encontradas, nuevas }
 *
 * Revisar dos veces no repite tareas (ver lib/administracion-escolar/tareas-ia.ts).
 * Apagado mientras `ZERO_AI_TAREAS` sea `false`.
 */
import { NextResponse } from 'next/server';
import { requireModuleAndPermission } from '@/lib/auth/api-guard';
import { revisarConZeroAi } from '@/lib/administracion-escolar/tareas-ia';
import { ZERO_AI_TAREAS } from '@/lib/administracion-escolar/tareas-reglas';
import { logAudit } from '@/lib/audit';

export async function POST() {
  // Apagado hasta que se decida subirlo (ver ZERO_AI_TAREAS).
  if (!ZERO_AI_TAREAS) return NextResponse.json({ error: 'No encontrado' }, { status: 404 });
  const auth = await requireModuleAndPermission('escolar', 'administracion-escolar:gestionar', { escritura: true });
  if (!auth.ok) return auth.response;
  const r = await revisarConZeroAi(auth.teamId);
  logAudit({
    teamId: auth.teamId, userId: auth.user.id, actor: auth.user.email, action: 'ESCOLAR_TAREAS_ZERO_AI',
    meta: { ...r },
  });
  return NextResponse.json(r);
}
