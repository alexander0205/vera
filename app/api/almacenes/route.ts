import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db/drizzle';
import { almacenes } from '@/lib/db/schema';
import { eq, and, desc } from 'drizzle-orm';
import { getUser, getTeamIdForUser } from '@/lib/db/queries';

const schema = z.object({
  nombre:      z.string().min(1, 'El nombre es obligatorio').max(255),
  direccion:   z.string().max(500).optional().nullable(),
  observacion: z.string().optional().nullable(),
  esDefault:   z.boolean().optional(),
});

export async function GET() {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  const teamId = await getTeamIdForUser();
  if (!teamId) return NextResponse.json({ error: 'Sin equipo' }, { status: 403 });

  const rows = await db.select().from(almacenes)
    .where(eq(almacenes.teamId, teamId))
    .orderBy(almacenes.esDefault, almacenes.nombre);

  return NextResponse.json({ almacenes: rows });
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

    const { nombre, direccion, observacion, esDefault } = parsed.data;

    // Si es default, quitar default de los demás
    if (esDefault) {
      await db.update(almacenes).set({ esDefault: 'false' }).where(eq(almacenes.teamId, teamId));
    }

    const [row] = await db.insert(almacenes).values({
      teamId,
      nombre:      nombre.trim(),
      direccion:   direccion?.trim() || null,
      observacion: observacion?.trim() || null,
      esDefault:   esDefault ? 'true' : 'false',
    }).returning();

    return NextResponse.json({ almacen: row }, { status: 201 });
  } catch (err) {
    console.error('[POST /api/almacenes]', err);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}
