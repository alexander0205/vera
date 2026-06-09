/**
 * GET /api/caja/aprobaciones — cierres pendientes de aprobación (caja:aprobar).
 * Lista los turnos en estado CIERRE_SOLICITADO del team con datos del cajero.
 */

import { NextResponse } from 'next/server';
import { and, eq, desc } from 'drizzle-orm';
import { requirePermission } from '@/lib/auth/api-guard';
import { db } from '@/lib/db/drizzle';
import { cajaTurnos, users } from '@/lib/db/schema';

export async function GET() {
  const auth = await requirePermission('caja:aprobar');
  if (!auth.ok) return auth.response;
  const { teamId } = auth;

  const pendientes = await db
    .select({
      id:                      cajaTurnos.id,
      numeroCierre:            cajaTurnos.numeroCierre,
      usuarioId:               cajaTurnos.usuarioId,
      cajero:                  users.name,
      cajeroEmail:             users.email,
      montoAperturaCentavos:   cajaTurnos.montoAperturaCentavos,
      efectivoContadoCentavos: cajaTurnos.efectivoContadoCentavos,
      montoEsperadoCentavos:   cajaTurnos.montoEsperadoCentavos,
      diferenciaCentavos:      cajaTurnos.diferenciaCentavos,
      cierreObs:               cajaTurnos.cierreObs,
      aperturaAt:              cajaTurnos.aperturaAt,
      cierreSolicitadoAt:      cajaTurnos.cierreSolicitadoAt,
    })
    .from(cajaTurnos)
    .leftJoin(users, eq(cajaTurnos.usuarioId, users.id))
    .where(and(
      eq(cajaTurnos.teamId, teamId),
      eq(cajaTurnos.estado, 'CIERRE_SOLICITADO'),
    ))
    .orderBy(desc(cajaTurnos.cierreSolicitadoAt));

  return NextResponse.json({ pendientes });
}
