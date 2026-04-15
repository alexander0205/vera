/**
 * GET  /api/facturas-recurrentes        — Lista facturas recurrentes del equipo (con paginación)
 * POST /api/facturas-recurrentes        — Crea una nueva factura recurrente
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/drizzle';
import { facturasRecurrentes, clients } from '@/lib/db/schema';
import { getTeamIdForUser } from '@/lib/db/queries';
import { eq, desc, and } from 'drizzle-orm';

// GET /api/facturas-recurrentes?page=1&limit=50
export async function GET(req: NextRequest) {
  const teamId = await getTeamIdForUser();
  if (!teamId) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

  const page  = parseInt(req.nextUrl.searchParams.get('page')  ?? '1');
  const limit = parseInt(req.nextUrl.searchParams.get('limit') ?? '50');
  const offset = (page - 1) * limit;

  const rows = await db
    .select({
      id:               facturasRecurrentes.id,
      nombre:           facturasRecurrentes.nombre,
      tipoEcf:          facturasRecurrentes.tipoEcf,
      tipoPago:         facturasRecurrentes.tipoPago,
      frecuencia:       facturasRecurrentes.frecuencia,
      fechaInicio:      facturasRecurrentes.fechaInicio,
      fechaFin:         facturasRecurrentes.fechaFin,
      proximaEmision:   facturasRecurrentes.proximaEmision,
      estado:           facturasRecurrentes.estado,
      totalEstimado:    facturasRecurrentes.totalEstimado,
      facturasEmitidas: facturasRecurrentes.facturasEmitidas,
      notas:            facturasRecurrentes.notas,
      clientId:         facturasRecurrentes.clientId,
      createdAt:        facturasRecurrentes.createdAt,
      // client info
      clienteRazonSocial: clients.razonSocial,
    })
    .from(facturasRecurrentes)
    .leftJoin(clients, eq(facturasRecurrentes.clientId, clients.id))
    .where(eq(facturasRecurrentes.teamId, teamId))
    .orderBy(desc(facturasRecurrentes.createdAt))
    .limit(limit)
    .offset(offset);

  return NextResponse.json({ facturasRecurrentes: rows, page, limit });
}

// POST /api/facturas-recurrentes
export async function POST(req: NextRequest) {
  const teamId = await getTeamIdForUser();
  if (!teamId) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

  const body = await req.json();

  if (!body.nombre?.trim())        return NextResponse.json({ error: 'El nombre es obligatorio' }, { status: 422 });
  if (!body.fechaInicio)           return NextResponse.json({ error: 'La fecha de inicio es obligatoria' }, { status: 422 });
  if (!body.proximaEmision)        return NextResponse.json({ error: 'La próxima emisión es obligatoria' }, { status: 422 });

  const [row] = await db
    .insert(facturasRecurrentes)
    .values({
      teamId,
      clientId:       body.clientId ?? null,
      nombre:         body.nombre.trim(),
      tipoEcf:        body.tipoEcf ?? '31',
      tipoPago:       body.tipoPago ?? 1,
      frecuencia:     body.frecuencia ?? 'mensual',
      fechaInicio:    body.fechaInicio,
      fechaFin:       body.fechaFin ?? null,
      proximaEmision: body.proximaEmision,
      estado:         'activa',
      items:          body.items ? JSON.stringify(body.items) : '[]',
      notas:          body.notas ?? null,
      totalEstimado:  Math.round((body.totalEstimado ?? 0) * 100),
    })
    .returning();

  return NextResponse.json({ facturaRecurrente: row }, { status: 201 });
}
