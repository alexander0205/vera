/**
 * GET /api/dgii/[rnc]/autenticacion
 *
 * Endpoint público opcional para que la DGII verifique disponibilidad
 * del contribuyente. Algunas implementaciones declaran una URL de autenticación
 * durante la postulación — DGII puede hacerle GET para confirmar que responde.
 *
 * Esto NO es el flujo de semilla → JWT (eso va hacia DGII, no desde DGII).
 * Es simplemente un healthcheck autenticado por RNC.
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/drizzle';
import { teams } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { logInfo } from '@/lib/logger';

export const runtime = 'nodejs';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ rnc: string }> },
) {
  const { rnc: rncPath } = await params;

  const [team] = await db
    .select({ id: teams.id, rnc: teams.rnc, razonSocial: teams.razonSocial })
    .from(teams)
    .where(eq(teams.rnc, rncPath))
    .limit(1);

  if (!team) {
    return NextResponse.json(
      { error: `No hay contribuyente registrado con RNC ${rncPath}` },
      { status: 404 },
    );
  }

  logInfo({
    teamId: team.id,
    source: '/api/dgii/[rnc]/autenticacion',
    message: `Healthcheck recibido para RNC ${rncPath}`,
  }).catch(() => {});

  return NextResponse.json({
    ok:          true,
    rnc:         team.rnc,
    razonSocial: team.razonSocial,
    servicio:    'EmiteDO — emisor electrónico DGII',
    version:     '1.6',
    timestamp:   new Date().toISOString(),
  });
}

// HEAD para pings ligeros (sin body)
export async function HEAD(
  _request: NextRequest,
  { params }: { params: Promise<{ rnc: string }> },
) {
  const { rnc: rncPath } = await params;
  const [team] = await db
    .select({ id: teams.id })
    .from(teams)
    .where(eq(teams.rnc, rncPath))
    .limit(1);
  return new NextResponse(null, { status: team ? 200 : 404 });
}
