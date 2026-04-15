/**
 * GET  /api/cotizaciones        — Lista cotizaciones del equipo (con búsqueda opcional)
 * POST /api/cotizaciones        — Crea una nueva cotización
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/drizzle';
import { cotizaciones } from '@/lib/db/schema';
import { getTeamIdForUser } from '@/lib/db/queries';
import { eq, desc } from 'drizzle-orm';

// GET /api/cotizaciones?q=...
export async function GET(req: NextRequest) {
  const teamId = await getTeamIdForUser();
  if (!teamId) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

  const q = req.nextUrl.searchParams.get('q')?.trim() ?? '';

  const rows = await db
    .select()
    .from(cotizaciones)
    .where(eq(cotizaciones.teamId, teamId))
    .orderBy(desc(cotizaciones.createdAt))
    .limit(100);

  const filtered = q
    ? rows.filter(r =>
        r.razonSocialComprador?.toLowerCase().includes(q.toLowerCase()) ||
        r.numero.toLowerCase().includes(q.toLowerCase())
      )
    : rows;

  return NextResponse.json({ cotizaciones: filtered });
}

// POST /api/cotizaciones
export async function POST(req: NextRequest) {
  const teamId = await getTeamIdForUser();
  if (!teamId) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

  const body = await req.json();

  // Generate numero: COT-NNNN
  const existing = await db
    .select({ numero: cotizaciones.numero })
    .from(cotizaciones)
    .where(eq(cotizaciones.teamId, teamId))
    .orderBy(desc(cotizaciones.createdAt))
    .limit(1);

  let nextNum = 1;
  if (existing.length > 0) {
    const last = existing[0].numero.replace('COT-', '');
    nextNum = (parseInt(last, 10) || 0) + 1;
  }
  const numero = `COT-${String(nextNum).padStart(4, '0')}`;

  const [row] = await db
    .insert(cotizaciones)
    .values({
      teamId,
      clientId: body.clientId ?? null,
      numero,
      estado: 'borrador',
      razonSocialComprador: body.razonSocialComprador ?? null,
      rncComprador: body.rncComprador ?? null,
      emailComprador: body.emailComprador ?? null,
      fechaVencimiento: body.fechaVencimiento ? new Date(body.fechaVencimiento) : null,
      montoSubtotal: Math.round((body.montoSubtotal ?? 0) * 100),
      montoDescuento: Math.round((body.montoDescuento ?? 0) * 100),
      totalItbis: Math.round((body.totalItbis ?? 0) * 100),
      montoTotal: Math.round((body.montoTotal ?? 0) * 100),
      items: body.items ? JSON.stringify(body.items) : null,
      notas: body.notas ?? null,
      terminosCondiciones: body.terminosCondiciones ?? null,
    })
    .returning();

  return NextResponse.json({ cotizacion: row }, { status: 201 });
}
