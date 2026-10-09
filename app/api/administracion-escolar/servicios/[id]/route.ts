import { NextRequest, NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { adminEscolarServicios, adminEscolarGrados } from '@/lib/db/schema';
import { invalidarEstructura } from '@/lib/cache/escolar';
import { requireModuleAndPermission } from '@/lib/auth/api-guard';

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireModuleAndPermission('escolar', 'administracion-escolar:configurar');
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const { nombre, tanda, orden, activo } = await req.json();

  const [row] = await db.update(adminEscolarServicios)
    .set({
      ...(nombre !== undefined ? { nombre: String(nombre).trim() } : {}),
      ...(tanda !== undefined ? { tanda: tanda?.trim() || null } : {}),
      ...(orden !== undefined ? { orden: Number(orden) || 0 } : {}),
      ...(activo !== undefined ? { activo: !!activo } : {}),
      updatedAt: new Date(),
    })
    .where(and(eq(adminEscolarServicios.id, parseInt(id)), eq(adminEscolarServicios.teamId, auth.teamId)))
    .returning();
  if (!row) return NextResponse.json({ error: 'No encontrado' }, { status: 404 });
  invalidarEstructura(auth.teamId);
  return NextResponse.json({ servicio: row });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireModuleAndPermission('escolar', 'administracion-escolar:configurar');
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const servicioId = parseInt(id);

  const [g] = await db.select({ id: adminEscolarGrados.id }).from(adminEscolarGrados)
    .where(and(eq(adminEscolarGrados.servicioId, servicioId), eq(adminEscolarGrados.teamId, auth.teamId)))
    .limit(1);
  if (g) {
    return NextResponse.json(
      { error: 'Este servicio tiene grados. Elimina los grados primero.' },
      { status: 409 },
    );
  }

  const [row] = await db.delete(adminEscolarServicios)
    .where(and(eq(adminEscolarServicios.id, servicioId), eq(adminEscolarServicios.teamId, auth.teamId)))
    .returning();
  if (!row) return NextResponse.json({ error: 'No encontrado' }, { status: 404 });
  invalidarEstructura(auth.teamId);
  return NextResponse.json({ ok: true });
}
