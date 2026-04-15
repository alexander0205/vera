/**
 * GET  /api/clientes          — Lista clientes del equipo (con búsqueda opcional)
 * POST /api/clientes          — Crea un nuevo cliente
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db/drizzle';
import { clients } from '@/lib/db/schema';
import { getUser, getTeamIdForUser } from '@/lib/db/queries';
import { eq, ilike, or, and } from 'drizzle-orm';

// Helper para transformar cadenas vacías a null
const optStr = (max = 500) =>
  z.string().max(max).optional().nullable()
    .transform(v => (typeof v === 'string' && v.trim() === '' ? null : v ?? null));

const clienteSchema = z.object({
  razonSocial: z.string().min(1, 'El nombre es obligatorio').max(255).transform(v => v.trim()),
  rnc:         optStr(20),
  // email: vacío o null → null; con valor debe ser email válido
  email: z.preprocess(
    v => (typeof v === 'string' && v.trim() === '' ? null : v),
    z.string().email('Correo electrónico inválido').nullable().optional()
  ),
  telefono:  optStr(30),
  direccion: optStr(500),
});

export async function GET(req: NextRequest) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  const teamId = await getTeamIdForUser();
  if (!teamId) return NextResponse.json({ error: 'Sin equipo' }, { status: 403 });

  const q = new URL(req.url).searchParams.get('q')?.trim();

  const rows = await db.select().from(clients)
    .where(
      q
        ? and(
            eq(clients.teamId, teamId),
            or(
              ilike(clients.razonSocial, `%${q}%`),
              ilike(clients.rnc, `%${q}%`),
              ilike(clients.email, `%${q}%`),
            )
          )
        : eq(clients.teamId, teamId)
    )
    .orderBy(clients.razonSocial);

  return NextResponse.json({ clientes: rows });
}

export async function POST(req: NextRequest) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  const teamId = await getTeamIdForUser();
  if (!teamId) return NextResponse.json({ error: 'Sin equipo' }, { status: 403 });

  const body = await req.json();
  const parsed = clienteSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: 'Datos inválidos', detalles: parsed.error.flatten() }, { status: 400 });

  const { razonSocial, rnc, email, telefono, direccion } = parsed.data;

  const [created] = await db.insert(clients).values({
    teamId,
    razonSocial,
    rnc:      rnc      || null,
    email:    email    || null,
    telefono: telefono || null,
    direccion: direccion || null,
  }).returning();

  return NextResponse.json({ ok: true, cliente: created }, { status: 201 });
}
