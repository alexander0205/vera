import { NextRequest, NextResponse } from 'next/server';
import { and, asc, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { adminEscolarServicios, adminEscolarPeriodos } from '@/lib/db/schema';
import { requireModuleAndPermission } from '@/lib/auth/api-guard';

/** Servicios (tandas) de un período. `?periodoId=N` filtra. */
export async function GET(req: NextRequest) {
  const auth = await requireModuleAndPermission('escolar', 'administracion-escolar:ver');
  if (!auth.ok) return auth.response;
  const periodoId = Number(req.nextUrl.searchParams.get('periodoId')) || null;
  const rows = await db.select().from(adminEscolarServicios)
    .where(periodoId
      ? and(eq(adminEscolarServicios.teamId, auth.teamId), eq(adminEscolarServicios.periodoId, periodoId))
      : eq(adminEscolarServicios.teamId, auth.teamId))
    .orderBy(asc(adminEscolarServicios.orden), asc(adminEscolarServicios.nombre));
  return NextResponse.json({ servicios: rows });
}

export async function POST(req: NextRequest) {
  const auth = await requireModuleAndPermission('escolar', 'administracion-escolar:configurar');
  if (!auth.ok) return auth.response;
  const { periodoId, nombre, tanda, orden } = await req.json();
  if (!nombre?.trim()) return NextResponse.json({ error: 'Nombre requerido' }, { status: 400 });
  const pId = Number(periodoId);
  if (!pId) return NextResponse.json({ error: 'Período requerido' }, { status: 400 });

  const [periodo] = await db.select({ id: adminEscolarPeriodos.id }).from(adminEscolarPeriodos)
    .where(and(eq(adminEscolarPeriodos.id, pId), eq(adminEscolarPeriodos.teamId, auth.teamId))).limit(1);
  if (!periodo) return NextResponse.json({ error: 'Período no encontrado' }, { status: 404 });

  const [row] = await db.insert(adminEscolarServicios).values({
    teamId: auth.teamId,
    periodoId: pId,
    nombre: nombre.trim(),
    tanda: tanda?.trim() || null,
    orden: orden ?? 0,
  }).returning();
  return NextResponse.json({ servicio: row });
}
