/**
 * GET /api/caja/historial — turnos CERRADOS del team (caja:ver).
 * Soporta ?limit=&offset=&usuarioId=
 */

import { NextRequest, NextResponse } from 'next/server';
import { and, eq, desc, sql } from 'drizzle-orm';
import { requirePermission } from '@/lib/auth/api-guard';
import { db } from '@/lib/db/drizzle';
import { cajaTurnos, users } from '@/lib/db/schema';

export async function GET(req: NextRequest) {
  const auth = await requirePermission('caja:ver');
  if (!auth.ok) return auth.response;
  const { teamId } = auth;

  const sp       = req.nextUrl.searchParams;
  const limit    = Math.min(Number(sp.get('limit')  ?? 50), 100);
  const offset   = Number(sp.get('offset') ?? 0);
  const uidParam = sp.get('usuarioId');
  const uidFilter = uidParam ? Number(uidParam) : null;

  const conditions = [
    eq(cajaTurnos.teamId, teamId),
    eq(cajaTurnos.estado, 'CERRADO'),
    ...(uidFilter ? [eq(cajaTurnos.usuarioId, uidFilter)] : []),
  ];

  const [rows, [{ total }]] = await Promise.all([
    db
      .select({
        id:                      cajaTurnos.id,
        numeroCierre:            cajaTurnos.numeroCierre,
        cajero:                  users.name,
        cajeroEmail:             users.email,
        montoAperturaCentavos:   cajaTurnos.montoAperturaCentavos,
        efectivoContadoCentavos: cajaTurnos.efectivoContadoCentavos,
        montoEsperadoCentavos:   cajaTurnos.montoEsperadoCentavos,
        diferenciaCentavos:      cajaTurnos.diferenciaCentavos,
        aperturaAt:              cajaTurnos.aperturaAt,
        aprobadoAt:              cajaTurnos.aprobadoAt,
        cierreObs:               cajaTurnos.cierreObs,
        aprobacionObs:           cajaTurnos.aprobacionObs,
      })
      .from(cajaTurnos)
      .leftJoin(users, eq(cajaTurnos.usuarioId, users.id))
      .where(and(...conditions))
      .orderBy(desc(cajaTurnos.aprobadoAt))
      .limit(limit)
      .offset(offset),
    db
      .select({ total: sql<number>`count(*)` })
      .from(cajaTurnos)
      .where(and(...conditions)),
  ]);

  return NextResponse.json({ turnos: rows, total: Number(total) });
}
