/**
 * Paquetes de conceptos («Horario regular», «Horario extendido», «Registro
 * SIGERD»…): una lista de conceptos con nombre que se asigna a uno o a muchos
 * niños de una vez, al matricular o en la cuadrícula de servicios.
 *
 *   GET                       → los paquetes activos del colegio
 *   POST   { nombre, descripcion?, conceptosIds }
 *   PATCH  { id, nombre?, descripcion?, conceptosIds?, orden? }
 *   DELETE ?id=N              → se apaga (no se borra: no hay nada que lo use de clave)
 */
import { NextRequest, NextResponse } from 'next/server';
import { and, asc, eq, inArray } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { adminEscolarConceptosPago, adminEscolarPaquetes } from '@/lib/db/schema';
import { requireModuleAndPermission } from '@/lib/auth/api-guard';

export async function GET() {
  const auth = await requireModuleAndPermission('escolar', 'administracion-escolar:ver');
  if (!auth.ok) return auth.response;
  const paquetes = await db
    .select({
      id: adminEscolarPaquetes.id,
      nombre: adminEscolarPaquetes.nombre,
      descripcion: adminEscolarPaquetes.descripcion,
      conceptosIds: adminEscolarPaquetes.conceptosIds,
      orden: adminEscolarPaquetes.orden,
    })
    .from(adminEscolarPaquetes)
    .where(and(eq(adminEscolarPaquetes.teamId, auth.teamId), eq(adminEscolarPaquetes.activo, true)))
    .orderBy(asc(adminEscolarPaquetes.orden), asc(adminEscolarPaquetes.nombre));
  return NextResponse.json({ paquetes });
}

/** Los conceptos tienen que ser de este colegio. Devuelve la lista limpia o el error. */
async function conceptosValidos(teamId: number, entrada: unknown): Promise<number[] | string> {
  if (!Array.isArray(entrada)) return 'Faltan los conceptos del paquete.';
  const ids = [...new Set(entrada.map(Number).filter((n) => Number.isInteger(n) && n > 0))];
  if (ids.length === 0) return 'Un paquete necesita al menos un concepto.';
  const existen = await db.select({ id: adminEscolarConceptosPago.id })
    .from(adminEscolarConceptosPago)
    .where(and(eq(adminEscolarConceptosPago.teamId, teamId), inArray(adminEscolarConceptosPago.id, ids)));
  if (existen.length !== ids.length) return 'Alguno de los conceptos no es de este colegio.';
  return ids;
}

const limpiarNombre = (v: unknown) => (typeof v === 'string' ? v.trim().slice(0, 80) : '');

export async function POST(req: NextRequest) {
  const auth = await requireModuleAndPermission('escolar', 'administracion-escolar:configurar', { escritura: true });
  if (!auth.ok) return auth.response;
  const body = await req.json().catch(() => ({}));
  const nombre = limpiarNombre(body.nombre);
  if (!nombre) return NextResponse.json({ error: 'Ponle un nombre al paquete.' }, { status: 400 });
  const ids = await conceptosValidos(auth.teamId, body.conceptosIds);
  if (typeof ids === 'string') return NextResponse.json({ error: ids }, { status: 400 });
  const [paquete] = await db.insert(adminEscolarPaquetes).values({
    teamId: auth.teamId, nombre, conceptosIds: ids,
    descripcion: typeof body.descripcion === 'string' ? body.descripcion.trim().slice(0, 200) || null : null,
    orden: Number.isInteger(body.orden) ? body.orden : 0,
  }).returning();
  return NextResponse.json({ paquete });
}

export async function PATCH(req: NextRequest) {
  const auth = await requireModuleAndPermission('escolar', 'administracion-escolar:configurar', { escritura: true });
  if (!auth.ok) return auth.response;
  const body = await req.json().catch(() => ({}));
  const id = Number(body.id);
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: 'Falta el paquete.' }, { status: 400 });
  const cambios: Partial<typeof adminEscolarPaquetes.$inferInsert> = { updatedAt: new Date() };
  if (body.nombre !== undefined) {
    const nombre = limpiarNombre(body.nombre);
    if (!nombre) return NextResponse.json({ error: 'Ponle un nombre al paquete.' }, { status: 400 });
    cambios.nombre = nombre;
  }
  if (body.descripcion !== undefined) {
    cambios.descripcion = typeof body.descripcion === 'string' ? body.descripcion.trim().slice(0, 200) || null : null;
  }
  if (body.conceptosIds !== undefined) {
    const ids = await conceptosValidos(auth.teamId, body.conceptosIds);
    if (typeof ids === 'string') return NextResponse.json({ error: ids }, { status: 400 });
    cambios.conceptosIds = ids;
  }
  if (Number.isInteger(body.orden)) cambios.orden = body.orden;
  const [paquete] = await db.update(adminEscolarPaquetes).set(cambios)
    .where(and(eq(adminEscolarPaquetes.id, id), eq(adminEscolarPaquetes.teamId, auth.teamId)))
    .returning();
  if (!paquete) return NextResponse.json({ error: 'No encontrado' }, { status: 404 });
  return NextResponse.json({ paquete });
}

export async function DELETE(req: NextRequest) {
  const auth = await requireModuleAndPermission('escolar', 'administracion-escolar:configurar', { escritura: true });
  if (!auth.ok) return auth.response;
  const id = Number(new URL(req.url).searchParams.get('id'));
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: 'Falta el paquete.' }, { status: 400 });
  const [paquete] = await db.update(adminEscolarPaquetes).set({ activo: false, updatedAt: new Date() })
    .where(and(eq(adminEscolarPaquetes.id, id), eq(adminEscolarPaquetes.teamId, auth.teamId)))
    .returning({ id: adminEscolarPaquetes.id });
  if (!paquete) return NextResponse.json({ error: 'No encontrado' }, { status: 404 });
  return NextResponse.json({ ok: true });
}
