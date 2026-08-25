/**
 * GET /api/mcp/v1/facturas-recurrentes — solo lectura, autenticado por API key.
 * Consumido por el endpoint MCP (/api/mcp), nunca directo por el frontend.
 */
import { NextRequest, NextResponse } from 'next/server';
import { and, eq, ilike } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { facturasRecurrentes } from '@/lib/db/schema';
import { requireApiKey } from '@/lib/auth/api-key-guard';

export async function GET(req: NextRequest) {
  const auth = await requireApiKey(req);
  if (!auth.ok) return auth.response;
  const { teamId } = auth;

  const sp = new URL(req.url).searchParams;
  const q = sp.get('q')?.trim();
  const estado = sp.get('estado');
  const clientId = sp.get('clientId');
  const limit = Math.min(Number(sp.get('limit')) || 200, 500);
  const offset = Math.max(Number(sp.get('offset')) || 0, 0);

  const condiciones = [eq(facturasRecurrentes.teamId, teamId)];
  if (estado) condiciones.push(eq(facturasRecurrentes.estado, estado));
  if (clientId) condiciones.push(eq(facturasRecurrentes.clientId, Number(clientId)));
  if (q) condiciones.push(ilike(facturasRecurrentes.nombre, `%${q}%`));

  const facturasRecurrentesRows = await db
    .select()
    .from(facturasRecurrentes)
    .where(and(...condiciones))
    .orderBy(facturasRecurrentes.nombre)
    .limit(limit)
    .offset(offset);

  return NextResponse.json({ facturasRecurrentes: facturasRecurrentesRows });
}
