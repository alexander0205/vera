/**
 * POST /api/nomina/contratos/plantillas/preview
 *
 * Previsualiza una plantilla ESTRUCTURADA mientras se arma en el editor, sin
 * guardar nada ni necesitar un empleado real: ensambla el contrato con un
 * empleado de ejemplo (etiquetas entre corchetes donde irían los datos) y los
 * datos reales de la empresa. Body: { config }.
 */
import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { requireModuleAndPermission } from '@/lib/auth/api-guard';
import { db } from '@/lib/db/drizzle';
import { teams } from '@/lib/db/schema';
import { hoyRD } from '@/lib/utils/format';
import { ensamblarContrato, normalizarConfig, EMPLEADO_EJEMPLO } from '@/lib/nomina/contrato-estructura';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const auth = await requireModuleAndPermission('nomina', 'nomina:configurar');
  if (!auth.ok) return auth.response;

  const body = await req.json().catch(() => ({}));
  const config = normalizarConfig(body.config);

  const [team] = await db
    .select({ name: teams.name, razonSocial: teams.razonSocial, rnc: teams.rnc, direccion: teams.direccion })
    .from(teams)
    .where(eq(teams.id, auth.teamId))
    .limit(1);

  const cuerpo = ensamblarContrato(
    config,
    EMPLEADO_EJEMPLO,
    { nombre: team?.razonSocial ?? team?.name ?? 'La empresa', rnc: team?.rnc ?? null, direccion: team?.direccion ?? null },
    hoyRD(),
  );

  return NextResponse.json({ cuerpo });
}
