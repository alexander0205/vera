import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db/drizzle';
import { listasPrecios } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { getUser, getTeamIdForUser } from '@/lib/db/queries';

const schema = z.object({
  nombre:      z.string().min(1, 'El nombre es obligatorio').max(255),
  tipo:        z.enum(['valor', 'porcentaje']).default('valor'),
  porcentaje:  z.number().int().min(0).max(100000).default(0),  // basis points
  esDescuento: z.boolean().default(true),
  descripcion: z.string().optional().nullable(),
  esDefault:   z.boolean().optional(),
});

export async function GET() {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  const teamId = await getTeamIdForUser();
  if (!teamId) return NextResponse.json({ error: 'Sin equipo' }, { status: 403 });

  const rows = await db.select().from(listasPrecios)
    .where(eq(listasPrecios.teamId, teamId))
    .orderBy(listasPrecios.esDefault, listasPrecios.nombre);

  return NextResponse.json({ listasPrecios: rows });
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

    const d = parsed.data;

    if (d.esDefault) {
      await db.update(listasPrecios).set({ esDefault: 'false' }).where(eq(listasPrecios.teamId, teamId));
    }

    const [row] = await db.insert(listasPrecios).values({
      teamId,
      nombre:      d.nombre.trim(),
      tipo:        d.tipo,
      porcentaje:  d.porcentaje,
      esDescuento: d.esDescuento ? 'true' : 'false',
      descripcion: d.descripcion?.trim() || null,
      esDefault:   d.esDefault ? 'true' : 'false',
    }).returning();

    return NextResponse.json({ lista: row }, { status: 201 });
  } catch (err) {
    console.error('[POST /api/listas-precios]', err);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}
