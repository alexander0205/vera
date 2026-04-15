/**
 * POST /api/equipo/perfil
 * Guarda logo, firma, colores y datos de contacto del equipo.
 */
import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/lib/db/drizzle';
import { teams } from '@/lib/db/schema';
import { getUser, getTeamIdForUser } from '@/lib/db/queries';

const MAX_IMG_SIZE = 1_000_000; // 1 MB en base64

const schema = z.object({
  razonSocial:       z.string().min(1).max(255).optional(),
  nombreComercial:   z.string().max(255).optional(),
  rnc:               z.string().max(11).optional(),
  direccion:         z.string().max(500).optional(),
  telefono:          z.string().max(30).optional(),
  sitioWeb:          z.string().max(200).optional(),
  emailFacturacion:  z.string().email().max(255).optional().or(z.literal('')),
  colorPrimario:     z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  logo:              z.string().max(MAX_IMG_SIZE).optional().or(z.literal('')),
  firma:             z.string().max(MAX_IMG_SIZE).optional().or(z.literal('')),
});

export async function POST(req: NextRequest) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Datos inválidos', details: parsed.error.flatten() }, { status: 422 });
  }

  const teamId = await getTeamIdForUser();
  if (!teamId) return NextResponse.json({ error: 'Sin equipo' }, { status: 403 });

  const data = parsed.data;
  await db.update(teams).set({
    ...(data.razonSocial       !== undefined && { razonSocial: data.razonSocial }),
    ...(data.nombreComercial   !== undefined && { nombreComercial: data.nombreComercial }),
    ...(data.rnc               !== undefined && { rnc: data.rnc }),
    ...(data.direccion         !== undefined && { direccion: data.direccion }),
    ...(data.telefono          !== undefined && { telefono: data.telefono } as any),
    ...(data.sitioWeb          !== undefined && { sitioWeb: data.sitioWeb } as any),
    ...(data.emailFacturacion  !== undefined && { emailFacturacion: data.emailFacturacion } as any),
    ...(data.colorPrimario     !== undefined && { colorPrimario: data.colorPrimario } as any),
    ...(data.logo              !== undefined && { logo: data.logo } as any),
    ...(data.firma             !== undefined && { firma: data.firma } as any),
    updatedAt: new Date(),
  }).where(eq(teams.id, teamId));

  return NextResponse.json({ ok: true });
}

export async function GET(_req: NextRequest) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const teamId = await getTeamIdForUser();
  if (!teamId) return NextResponse.json({ error: 'Sin equipo' }, { status: 403 });

  const [team] = await db
    .select()
    .from(teams)
    .where(eq(teams.id, teamId))
    .limit(1);

  return NextResponse.json({
    razonSocial:      team.razonSocial,
    nombreComercial:  team.nombreComercial,
    rnc:              team.rnc,
    direccion:        team.direccion,
    telefono:         (team as any).telefono,
    sitioWeb:         (team as any).sitioWeb,
    emailFacturacion: (team as any).emailFacturacion,
    colorPrimario:    (team as any).colorPrimario ?? '#1e40af',
    logo:             (team as any).logo,
    firma:            (team as any).firma,
  });
}
