/**
 * GET /api/mcp/v1/facturas — solo lectura, autenticado por API key.
 * Proyección deliberadamente reducida: se excluyen XML/PDF/campos internos
 * de DGII — esta ruta es para consumo de una AI externa, no para el detalle
 * completo que usa el frontend en /api/facturas.
 */
import { NextRequest, NextResponse } from 'next/server';
import { and, eq, gte, ilike, lte, or } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { ecfDocuments } from '@/lib/db/schema';
import { requireApiKey } from '@/lib/auth/api-key-guard';
import { CAMPOS_FACTURA } from '@/lib/mcp/campos-facturas';

export async function GET(req: NextRequest) {
  const auth = await requireApiKey(req);
  if (!auth.ok) return auth.response;
  const { teamId } = auth;

  const sp = new URL(req.url).searchParams;
  const q = sp.get('q')?.trim();
  const estado = sp.get('estado');
  const estadoPago = sp.get('estadoPago');
  const clientId = sp.get('clientId');
  const desde = sp.get('desde');
  const hasta = sp.get('hasta');
  const limit = Math.min(Number(sp.get('limit')) || 200, 500);
  const offset = Math.max(Number(sp.get('offset')) || 0, 0);

  const condiciones = [eq(ecfDocuments.teamId, teamId)];
  if (estado) condiciones.push(eq(ecfDocuments.estado, estado));
  if (estadoPago) condiciones.push(eq(ecfDocuments.estadoPago, estadoPago));
  if (clientId) condiciones.push(eq(ecfDocuments.clientId, Number(clientId)));
  if (desde) condiciones.push(gte(ecfDocuments.fechaEmision, new Date(desde)));
  if (hasta) condiciones.push(lte(ecfDocuments.fechaEmision, new Date(hasta)));
  if (q) {
    condiciones.push(
      or(
        ilike(ecfDocuments.encf, `%${q}%`),
        ilike(ecfDocuments.codigo, `%${q}%`),
        ilike(ecfDocuments.razonSocialComprador, `%${q}%`),
        ilike(ecfDocuments.rncComprador, `%${q}%`),
      )!,
    );
  }

  const facturas = await db
    .select(CAMPOS_FACTURA)
    .from(ecfDocuments)
    .where(and(...condiciones))
    .orderBy(ecfDocuments.fechaEmision)
    .limit(limit)
    .offset(offset);

  return NextResponse.json({ facturas });
}
