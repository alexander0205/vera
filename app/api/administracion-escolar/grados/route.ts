import { NextRequest, NextResponse } from 'next/server';
import { and, asc, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { adminEscolarGrados, adminEscolarServicios } from '@/lib/db/schema';
import { requireModuleAndPermission } from '@/lib/auth/api-guard';

/** Grados (Primero, Segundo…) de un servicio. `?servicioId=N` filtra. */
export async function GET(req: NextRequest) {
  const auth = await requireModuleAndPermission('escolar', 'administracion-escolar:ver');
  if (!auth.ok) return auth.response;
  const servicioId = Number(req.nextUrl.searchParams.get('servicioId')) || null;
  const rows = await db.select().from(adminEscolarGrados)
    .where(servicioId
      ? and(eq(adminEscolarGrados.teamId, auth.teamId), eq(adminEscolarGrados.servicioId, servicioId))
      : eq(adminEscolarGrados.teamId, auth.teamId))
    .orderBy(asc(adminEscolarGrados.orden), asc(adminEscolarGrados.nombre));
  return NextResponse.json({ grados: rows });
}

export async function POST(req: NextRequest) {
  const auth = await requireModuleAndPermission('escolar', 'administracion-escolar:configurar');
  if (!auth.ok) return auth.response;
  const { servicioId, nombre, nivel, orden } = await req.json();
  if (!nombre?.trim()) return NextResponse.json({ error: 'Nombre requerido' }, { status: 400 });
  const sId = Number(servicioId);
  if (!sId) return NextResponse.json({ error: 'Servicio requerido' }, { status: 400 });

  const [servicio] = await db.select({ id: adminEscolarServicios.id }).from(adminEscolarServicios)
    .where(and(eq(adminEscolarServicios.id, sId), eq(adminEscolarServicios.teamId, auth.teamId))).limit(1);
  if (!servicio) return NextResponse.json({ error: 'Servicio no encontrado' }, { status: 404 });

  const [row] = await db.insert(adminEscolarGrados).values({
    teamId: auth.teamId,
    servicioId: sId,
    nombre: nombre.trim(),
    nivel: nivel?.trim() || null,
    orden: orden ?? 0,
  }).returning();
  return NextResponse.json({ grado: row });
}
