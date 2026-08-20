/**
 * POST /api/compras/local  — Registra compra manual + movimientos ENTRADA
 * GET  /api/compras/local  — Lista compras locales del equipo
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db/drizzle';
import { comprasLocales, comprasLocalesItems, teamMembers, products } from '@/lib/db/schema';
import { getUser, getTeamIdForUser } from '@/lib/db/queries';
import { eq, and, desc } from 'drizzle-orm';
import { userCan } from '@/lib/config/roles';
import { registrarEntradas } from '@/lib/inventario/entrada';

const itemSchema = z.object({
  productoId:    z.number().int().positive(),
  cantidad:      z.number().int().positive(),
  costoUnitario: z.number().min(0).default(0),
  almacenId:     z.number().int().positive().optional().nullable(),
});

const compraSchema = z.object({
  proveedorRnc:    z.string().max(20).optional().nullable(),
  proveedorNombre: z.string().max(255).optional().nullable(),
  fecha:           z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  referenciaEncf:  z.string().max(40).optional().nullable(),
  notas:           z.string().max(1000).optional().nullable(),
  almacenId:       z.number().int().positive().optional().nullable(),
  formaPago:       z.enum(['contado', 'credito']).default('credito'),
  metodoPago:      z.enum(['efectivo', 'transferencia', 'tarjeta', 'cheque', 'deposito', 'otro']).default('efectivo'),
  fechaVencimiento:z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  /** Pesos DOP; se persiste en centavos junto con el total de la compra. */
  itbis:           z.number().finite().min(0).default(0),
  items:           z.array(itemSchema).min(1, 'Debe incluir al menos un ítem'),
});

export async function POST(req: NextRequest) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  const teamId = await getTeamIdForUser();
  if (!teamId) return NextResponse.json({ error: 'Sin equipo' }, { status: 403 });

  const [m] = await db
    .select({ role: teamMembers.role })
    .from(teamMembers)
    .where(and(eq(teamMembers.userId, user.id), eq(teamMembers.teamId, teamId)))
    .limit(1);
  if (!userCan(user.platformRole, m?.role, 'productos:gestionar')) {
    return NextResponse.json({ error: 'Sin permiso' }, { status: 403 });
  }

  const body = await req.json();
  const parsed = compraSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Datos inválidos', detalles: parsed.error.flatten() }, { status: 400 });
  }

  const { proveedorRnc, proveedorNombre, fecha, referenciaEncf, notas, almacenId, itbis, formaPago, metodoPago, fechaVencimiento, items } = parsed.data;

  // Verificar que todos los productos pertenecen al team y son tipo bien
  const prods = await db
    .select({ id: products.id, tipo: products.tipo })
    .from(products)
    .where(eq(products.teamId, teamId));

  const prodMap = new Map(prods.map(p => [p.id, p]));
  const invalidos = items.filter(i => {
    const p = prodMap.get(i.productoId);
    return !p || p.tipo !== 'bien';
  });
  if (invalidos.length > 0) {
    return NextResponse.json(
      { error: 'Solo se pueden registrar entradas para productos tipo bien del equipo.' },
      { status: 422 },
    );
  }

  const baseCents = items.reduce((s, i) => s + Math.round(i.costoUnitario * 100) * i.cantidad, 0);
  const itbisCents = Math.round(itbis * 100);
  const montoTotal = baseCents + itbisCents;

  const [compra] = await db.transaction(async (tx) => {
    const [c] = await tx.insert(comprasLocales).values({
      teamId,
      proveedorRnc:    proveedorRnc    || null,
      proveedorNombre: proveedorNombre || null,
      fecha:           fecha ?? new Date().toISOString().slice(0, 10),
      referenciaEncf:  referenciaEncf  || null,
      notas:           notas           || null,
      itbisCents,
      montoTotal,
      formaPago,
      metodoPago,
      fechaVencimiento: formaPago === 'credito' ? fechaVencimiento ?? null : null,
      estadoPago: formaPago === 'contado' ? 'PAGADA' : 'PENDIENTE',
      createdBy: user.id,
    }).returning();

    await tx.insert(comprasLocalesItems).values(
      items.map(i => ({
        compraId:      c.id,
        productoId:    i.productoId,
        almacenId:     i.almacenId ?? almacenId ?? null,
        cantidad:      i.cantidad,
        costoUnitario: Math.round(i.costoUnitario * 100),
      })),
    );

    return [c];
  });

  // Movimientos ENTRADA — fire-and-forget
  const motivo = `Compra #${compra.id}${referenciaEncf ? ` — e-NCF ${referenciaEncf}` : ''}`;
  registrarEntradas(
    teamId,
    user.id,
    compra.id,
    motivo,
    items.map(i => ({
      productoId: i.productoId,
      cantidad:   i.cantidad,
      almacenId:  i.almacenId ?? almacenId ?? null,
    })),
  ).catch((e) => console.error('[compras/local] entradas failed', e));

  return NextResponse.json({ ok: true, compra }, { status: 201 });
}

export async function GET() {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  const teamId = await getTeamIdForUser();
  if (!teamId) return NextResponse.json({ error: 'Sin equipo' }, { status: 403 });

  const [m] = await db
    .select({ role: teamMembers.role })
    .from(teamMembers)
    .where(and(eq(teamMembers.userId, user.id), eq(teamMembers.teamId, teamId)))
    .limit(1);
  if (!userCan(user.platformRole, m?.role, 'productos:ver')) {
    return NextResponse.json({ error: 'Sin permiso' }, { status: 403 });
  }

  const rows = await db
    .select()
    .from(comprasLocales)
    .where(eq(comprasLocales.teamId, teamId))
    .orderBy(desc(comprasLocales.createdAt))
    .limit(100);

  return NextResponse.json({ compras: rows });
}
