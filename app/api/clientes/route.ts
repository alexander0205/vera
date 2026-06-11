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

// RNC dominicano: cédula (11 dígitos) o RNC (9 dígitos).
// Normaliza a solo dígitos (acepta guiones/espacios del autocomplete de cédula).
const rncSchema = z.preprocess(
  v => (typeof v === 'string' ? v.replace(/[-\s]/g, '') : v),
  z.preprocess(
    v => (typeof v === 'string' && v === '' ? null : v),
    z.string()
      .nullable()
      .optional()
      .refine(v => v == null || /^\d{9}$|^\d{11}$/.test(v), {
        message: 'RNC debe tener 9 dígitos (empresa) u 11 dígitos (cédula)',
      })
      .transform(v => (v == null ? null : v)),
  ),
);

const clienteSchema = z.object({
  razonSocial: z.string().min(1, 'El nombre es obligatorio').max(255).transform(v => v.trim()),
  rnc:         rncSchema,
  // email: vacío o null → null; con valor debe ser email válido
  email: z.preprocess(
    v => (typeof v === 'string' && v.trim() === '' ? null : v),
    z.string().email('Correo electrónico inválido').nullable().optional()
  ),
  telefono:    optStr(30),
  direccion:   optStr(500),
  descripcion: optStr(2000),
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

  const { razonSocial, rnc, email, telefono, direccion, descripcion } = parsed.data;

  // CLI-12: avisar al cliente si ya existe un cliente con el mismo RNC en el team.
  // Si el caller envía `?force=1` (o `force:true` en body) se permite duplicado.
  const force = new URL(req.url).searchParams.get('force') === '1'
    || (body && body.force === true);
  if (rnc && !force) {
    const [dup] = await db.select({ id: clients.id, razonSocial: clients.razonSocial })
      .from(clients)
      .where(and(eq(clients.teamId, teamId), eq(clients.rnc, rnc)))
      .limit(1);
    if (dup) {
      return NextResponse.json(
        {
          error: 'RNC duplicado',
          duplicado: dup,
          mensaje: `Ya existe el cliente "${dup.razonSocial}" con el mismo RNC. Reenvía con force=true para crear de todos modos.`,
        },
        { status: 409 },
      );
    }
  }

  const [created] = await db.insert(clients).values({
    teamId,
    razonSocial,
    rnc:         rnc         || null,
    email:       email       || null,
    telefono:    telefono    || null,
    direccion:   direccion   || null,
    descripcion: descripcion || null,
    createdBy:   user.id,
  }).returning();

  return NextResponse.json({ ok: true, cliente: created }, { status: 201 });
}
