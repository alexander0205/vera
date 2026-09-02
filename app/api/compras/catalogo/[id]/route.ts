/**
 * PATCH  /api/compras/catalogo/[id] — edita un artículo del catálogo de compras.
 * DELETE /api/compras/catalogo/[id] — lo desactiva (soft delete: activo=false).
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db/drizzle';
import { catalogoCompras } from '@/lib/db/schema';
import { getTeamIdForUser } from '@/lib/db/queries';
import { requirePermission } from '@/lib/auth/api-guard';
import { and, eq } from 'drizzle-orm';

const editarSchema = z.object({
  nombre:          z.string().min(1).max(255).optional(),
  descripcion:     z.string().max(1000).optional().nullable(),
  referencia:      z.string().max(100).optional().nullable(),
  costoDOP:        z.number().min(0).optional(),
  tasaItbis:       z.enum(['0.18', '0.16', '0', 'exento']).optional(),
  proveedorNombre: z.string().max(255).optional().nullable(),
  proveedorRnc:    z.string().max(20).optional().nullable(),
});

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermission('facturas:crear');
  if (!auth.ok) return auth.response;
  const { teamId } = auth;

  const id = Number((await params).id);
  if (!Number.isFinite(id)) return NextResponse.json({ error: 'ID inválido' }, { status: 400 });

  const parsed = editarSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: 'Datos inválidos', detalles: parsed.error.flatten() }, { status: 400 });
  }
  const d = parsed.data;

  const [row] = await db
    .update(catalogoCompras)
    .set({
      ...(d.nombre          !== undefined ? { nombre: d.nombre } : {}),
      ...(d.descripcion     !== undefined ? { descripcion: d.descripcion || null } : {}),
      ...(d.referencia      !== undefined ? { referencia: d.referencia || null } : {}),
      ...(d.costoDOP        !== undefined ? { costoCents: Math.round(d.costoDOP * 100) } : {}),
      ...(d.tasaItbis       !== undefined ? { tasaItbis: d.tasaItbis } : {}),
      ...(d.proveedorNombre !== undefined ? { proveedorNombre: d.proveedorNombre || null } : {}),
      ...(d.proveedorRnc    !== undefined ? { proveedorRnc: d.proveedorRnc || null } : {}),
      updatedAt: new Date(),
    })
    .where(and(eq(catalogoCompras.id, id), eq(catalogoCompras.teamId, teamId)))
    .returning();

  if (!row) return NextResponse.json({ error: 'No encontrado' }, { status: 404 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermission('facturas:crear');
  if (!auth.ok) return auth.response;
  const { teamId } = auth;

  const id = Number((await params).id);
  if (!Number.isFinite(id)) return NextResponse.json({ error: 'ID inválido' }, { status: 400 });

  const [row] = await db
    .update(catalogoCompras)
    .set({ activo: false, updatedAt: new Date() })
    .where(and(eq(catalogoCompras.id, id), eq(catalogoCompras.teamId, teamId)))
    .returning();

  if (!row) return NextResponse.json({ error: 'No encontrado' }, { status: 404 });
  return NextResponse.json({ ok: true });
}
