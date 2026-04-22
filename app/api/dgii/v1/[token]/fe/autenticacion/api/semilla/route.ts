/**
 * GET /api/dgii/v1/[token]/fe/autenticacion/api/semilla
 *
 * Genera y devuelve una semilla XML para el tenant identificado por [token].
 * El caller debe firmar esta semilla con su certificado digital P12 y
 * enviarla al endpoint /fe/autenticacion/api/validacioncertificado
 * para obtener un token de acceso.
 *
 * Este endpoint replica el patrón de autenticación de la DGII — pero en
 * dirección inversa: el contribuyente se autentica ante EmiteDO.
 *
 * La semilla se almacena en memoria por 5 minutos (validez estándar DGII).
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/drizzle';
import { teams } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { randomBytes } from 'crypto';
import { logInfo } from '@/lib/logger';

export const runtime = 'nodejs';

// Cache en memoria: token → { valor, expira }
// En producción multiinstancia usar Redis/Upstash
const semillaCache = new Map<string, { valor: string; expira: number }>();

export function getSemillaCache() {
  return semillaCache;
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;

  // ── 1) Verificar que el token corresponde a un tenant activo ────────────
  const [team] = await db
    .select({ id: teams.id, rnc: teams.rnc })
    .from(teams)
    .where(eq(teams.dgiiRoutingToken, token))
    .limit(1);

  if (!team) {
    return new NextResponse(
      `<error><mensaje>Token de enrutamiento inválido</mensaje></error>`,
      { status: 404, headers: { 'Content-Type': 'application/xml' } },
    );
  }

  // ── 2) Generar semilla aleatoria ─────────────────────────────────────────
  const valor  = randomBytes(16).toString('hex').toUpperCase();
  const fecha  = new Date().toISOString();
  const expira = Date.now() + 5 * 60 * 1000; // 5 minutos

  semillaCache.set(token, { valor, expira });

  // Limpiar semillas expiradas (housekeeping simple)
  for (const [k, v] of semillaCache.entries()) {
    if (Date.now() > v.expira) semillaCache.delete(k);
  }

  logInfo({
    teamId: team.id,
    source: '/api/dgii/v1/[token]/fe/autenticacion/api/semilla',
    message: `Semilla generada para RNC ${team.rnc}`,
  }).catch(() => {});

  // ── 3) Devolver semilla en formato XML estándar DGII ─────────────────────
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<semilla>
  <valor>${valor}</valor>
  <fecha>${fecha}</fecha>
</semilla>`;

  return new NextResponse(xml, {
    status: 200,
    headers: { 'Content-Type': 'application/xml; charset=utf-8' },
  });
}
