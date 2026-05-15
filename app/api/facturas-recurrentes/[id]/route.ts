/**
 * GET    /api/facturas-recurrentes/[id]  — Detalle de una factura recurrente
 * PUT    /api/facturas-recurrentes/[id]  — Actualiza (pausa/reanuda/edita)
 * DELETE /api/facturas-recurrentes/[id]  — Elimina
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/drizzle';
import { facturasRecurrentes } from '@/lib/db/schema';
import { getTeamIdForUser } from '@/lib/db/queries';
import { eq, and } from 'drizzle-orm';

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Ctx) {
  const teamId = await getTeamIdForUser();
  if (!teamId) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

  const { id } = await params;
  const numId = parseInt(id);
  if (isNaN(numId)) return NextResponse.json({ error: 'ID inválido' }, { status: 400 });

  const [row] = await db
    .select()
    .from(facturasRecurrentes)
    .where(and(eq(facturasRecurrentes.id, numId), eq(facturasRecurrentes.teamId, teamId)));

  if (!row) return NextResponse.json({ error: 'No encontrada' }, { status: 404 });
  return NextResponse.json({ facturaRecurrente: row });
}

export async function PUT(req: NextRequest, { params }: Ctx) {
  const teamId = await getTeamIdForUser();
  if (!teamId) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

  const { id } = await params;
  const numId = parseInt(id);
  if (isNaN(numId)) return NextResponse.json({ error: 'ID inválido' }, { status: 400 });

  const body = await req.json();

  // Validar estado contra whitelist (evita strings arbitrarios que confundan al cron/UI)
  const ESTADOS_VALIDOS = ['activa', 'pausada', 'finalizada'] as const;
  if (body.estado != null && !ESTADOS_VALIDOS.includes(body.estado)) {
    return NextResponse.json({ error: 'Estado inválido' }, { status: 422 });
  }

  // diaCobro solo aplica para frecuencias mensual/trimestral/anual.
  // Si el body cambia frecuencia a semanal/quincenal, anular diaCobro automáticamente.
  // Si frecuencia no cambia, respetar el valor enviado pero validar contra la frecuencia actual.
  let diaCobroFinal: number | null | undefined = undefined;
  if (body.diaCobro !== undefined || body.frecuencia != null) {
    // Necesitamos saber la frecuencia efectiva. Si body.frecuencia viene, usar esa.
    // Si no, hay que leer la actual de la DB.
    let frecuenciaEfectiva: string | null = body.frecuencia ?? null;
    if (!frecuenciaEfectiva) {
      const [current] = await db
        .select({ frecuencia: facturasRecurrentes.frecuencia })
        .from(facturasRecurrentes)
        .where(and(eq(facturasRecurrentes.id, numId), eq(facturasRecurrentes.teamId, teamId)));
      frecuenciaEfectiva = current?.frecuencia ?? 'mensual';
    }
    const aplicaDiaCobro = ['mensual', 'trimestral', 'anual'].includes(frecuenciaEfectiva);
    if (!aplicaDiaCobro) {
      diaCobroFinal = null;
    } else if (body.diaCobro !== undefined) {
      diaCobroFinal = body.diaCobro != null
        ? Math.min(31, Math.max(1, parseInt(body.diaCobro)))
        : null;
    }
  }

  const [row] = await db
    .update(facturasRecurrentes)
    .set({
      ...(body.nombre        != null && { nombre: body.nombre }),
      ...(body.descripcion   !== undefined && {
        descripcion: body.descripcion?.trim() ? body.descripcion.trim().slice(0, 200) : null
      }),
      ...(body.tipoEcf       != null && { tipoEcf: body.tipoEcf }),
      ...(body.tipoPago      != null && { tipoPago: body.tipoPago }),
      ...(body.diasParaPago  !== undefined && { diasParaPago: body.diasParaPago ? parseInt(body.diasParaPago) : null }),
      ...(body.frecuencia    != null && { frecuencia: body.frecuencia }),
      ...(diaCobroFinal      !== undefined && { diaCobro: diaCobroFinal }),
      ...(body.fechaInicio   != null && { fechaInicio: body.fechaInicio }),
      ...(body.fechaFin      !== undefined && { fechaFin: body.fechaFin ?? null }),
      ...(body.proximaEmision != null && { proximaEmision: body.proximaEmision }),
      ...(body.estado        != null && { estado: body.estado }),
      ...(body.items         != null && { items: JSON.stringify(body.items) }),
      ...(body.notas         !== undefined && { notas: body.notas ?? null }),
      ...(body.clientId      !== undefined && { clientId: body.clientId ?? null }),
      ...(body.totalEstimado != null && { totalEstimado: Math.round(body.totalEstimado * 100) }),
      ...(body.facturasEmitidas != null && { facturasEmitidas: body.facturasEmitidas }),
      updatedAt: new Date(),
    })
    .where(and(eq(facturasRecurrentes.id, numId), eq(facturasRecurrentes.teamId, teamId)))
    .returning();

  if (!row) return NextResponse.json({ error: 'No encontrada' }, { status: 404 });
  return NextResponse.json({ facturaRecurrente: row });
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const teamId = await getTeamIdForUser();
  if (!teamId) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

  const { id } = await params;
  const numId = parseInt(id);
  if (isNaN(numId)) return NextResponse.json({ error: 'ID inválido' }, { status: 400 });

  await db
    .delete(facturasRecurrentes)
    .where(and(eq(facturasRecurrentes.id, numId), eq(facturasRecurrentes.teamId, teamId)));

  return NextResponse.json({ ok: true });
}
