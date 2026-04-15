import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db/drizzle';
import { vendedores } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { getUser, getTeamIdForUser } from '@/lib/db/queries';

const schema = z.object({
  nombre:         z.string().min(1, 'El nombre es obligatorio').max(255),
  identificacion: z.string().max(100).optional().nullable(),
  observacion:    z.string().optional().nullable(),
});

export async function GET(req: NextRequest) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  const teamId = await getTeamIdForUser();
  if (!teamId) return NextResponse.json({ error: 'Sin equipo' }, { status: 403 });

  const q = req.nextUrl.searchParams.get('q') ?? '';
  const rows = await db.select().from(vendedores)
    .where(eq(vendedores.teamId, teamId))
    .orderBy(vendedores.nombre);

  const filtered = q
    ? rows.filter(v => v.nombre.toLowerCase().includes(q.toLowerCase()) || v.identificacion?.toLowerCase().includes(q.toLowerCase()))
    : rows;

  return NextResponse.json({ vendedores: filtered.filter(v => v.activo === 'true') });
}

export async function POST(req: NextRequest) {
  try {
    const user = await getUser();
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    const teamId = await getTeamIdForUser();
    if (!teamId) return NextResponse.json({ error: 'Sin equipo' }, { status: 403 });

    const body = await req.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: 'Datos inválidos', detalles: parsed.error.flatten() }, { status: 400 });

    const [row] = await db.insert(vendedores).values({
      teamId,
      nombre:         parsed.data.nombre.trim(),
      identificacion: parsed.data.identificacion?.trim() || null,
      observacion:    parsed.data.observacion?.trim() || null,
    }).returning();

    return NextResponse.json({ vendedor: row }, { status: 201 });
  } catch (err) {
    console.error('[POST /api/vendedores]', err);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}
