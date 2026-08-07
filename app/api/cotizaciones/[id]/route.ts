/**
 * GET    /api/cotizaciones/[id]  — Detalle de una cotización
 * PUT    /api/cotizaciones/[id]  — Actualiza una cotización
 * DELETE /api/cotizaciones/[id]  — Elimina una cotización
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/drizzle';
import { cotizaciones } from '@/lib/db/schema';
import { getTeamIdForUser } from '@/lib/db/queries';
import { requirePermission } from '@/lib/auth/api-guard';
import { userCanForTeam } from '@/lib/auth/permissions';
import { validarPreciosDeCatalogo } from '@/lib/facturas/precio-guard';
import { eq, and } from 'drizzle-orm';

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Ctx) {
  const teamId = await getTeamIdForUser();
  if (!teamId) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  const { id } = await params;
  const numId = parseInt(id);
  if (isNaN(numId)) return NextResponse.json({ error: 'ID inválido' }, { status: 400 });

  const [row] = await db.select().from(cotizaciones)
    .where(and(eq(cotizaciones.id, numId), eq(cotizaciones.teamId, teamId)));
  if (!row) return NextResponse.json({ error: 'No encontrada' }, { status: 404 });
  return NextResponse.json({ cotizacion: row });
}

export async function PUT(req: NextRequest, { params }: Ctx) {
  const auth = await requirePermission('cotizaciones:gestionar');
  if (!auth.ok) return auth.response;
  const { teamId, user, teamRole } = auth;
  const { id } = await params;
  const numId = parseInt(id);
  if (isNaN(numId)) return NextResponse.json({ error: 'ID inválido' }, { status: 400 });

  const body = await req.json();

  // Mismo gate de precios que al crear: editar no puede ser la vía para
  // cambiar un precio que no se podía poner de entrada.
  if (Array.isArray(body.items)
    && !await userCanForTeam(teamId, user.platformRole, teamRole, 'facturas:precio-editar')) {
    const errPrecio = await validarPreciosDeCatalogo({ teamId, lineas: body.items });
    if (errPrecio) return NextResponse.json({ error: errPrecio }, { status: 403 });
  }

  const [row] = await db.update(cotizaciones)
    .set({
      ...(body.estado != null && { estado: body.estado }),
      ...(body.razonSocialComprador != null && { razonSocialComprador: body.razonSocialComprador }),
      ...(body.rncComprador != null && { rncComprador: body.rncComprador }),
      ...(body.emailComprador != null && { emailComprador: body.emailComprador }),
      ...(body.fechaVencimiento != null && { fechaVencimiento: new Date(body.fechaVencimiento) }),
      ...(body.montoSubtotal != null && { montoSubtotal: Math.round(body.montoSubtotal * 100) }),
      ...(body.montoDescuento != null && { montoDescuento: Math.round(body.montoDescuento * 100) }),
      ...(body.totalItbis != null && { totalItbis: Math.round(body.totalItbis * 100) }),
      ...(body.montoTotal != null && { montoTotal: Math.round(body.montoTotal * 100) }),
      ...(body.items != null && { items: JSON.stringify(body.items) }),
      // `!== undefined`, no `!= null`: el formulario manda null cuando el campo
      // se deja vacío, y con `!= null` la línea se saltaba — borrar el texto no
      // se guardaba nunca y volvía a aparecer al reabrir la cotización.
      ...(body.notas !== undefined && { notas: body.notas }),
      ...(body.terminosCondiciones !== undefined && { terminosCondiciones: body.terminosCondiciones }),
      ...(body.retenciones !== undefined && { retenciones: body.retenciones ? JSON.stringify(body.retenciones) : null }),
      ...(body.comentario !== undefined && { comentario: body.comentario }),
      ...(body.pieFactura !== undefined && { pieFactura: body.pieFactura }),
      updatedAt: new Date(),
    })
    .where(and(eq(cotizaciones.id, numId), eq(cotizaciones.teamId, teamId)))
    .returning();

  if (!row) return NextResponse.json({ error: 'No encontrada' }, { status: 404 });
  return NextResponse.json({ cotizacion: row });
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const auth = await requirePermission('cotizaciones:gestionar');
  if (!auth.ok) return auth.response;
  const { teamId } = auth;
  const { id } = await params;
  const numId = parseInt(id);
  if (isNaN(numId)) return NextResponse.json({ error: 'ID inválido' }, { status: 400 });

  await db.delete(cotizaciones)
    .where(and(eq(cotizaciones.id, numId), eq(cotizaciones.teamId, teamId)));
  return NextResponse.json({ ok: true });
}
