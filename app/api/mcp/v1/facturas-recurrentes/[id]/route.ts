/**
 * GET /api/mcp/v1/facturas-recurrentes/[id] — solo lectura, autenticado por API key.
 * Consumido por el endpoint MCP (/api/mcp), nunca directo por el frontend.
 */
import { NextRequest, NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { facturasRecurrentes } from '@/lib/db/schema';
import { requireApiKey } from '@/lib/auth/api-key-guard';

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: Ctx) {
  const auth = await requireApiKey(req);
  if (!auth.ok) return auth.response;
  const { teamId } = auth;

  const { id } = await params;
  const recurrenteId = parseInt(id);
  if (isNaN(recurrenteId)) return NextResponse.json({ error: 'ID inválido' }, { status: 400 });

  const [facturaRecurrente] = await db
    .select()
    .from(facturasRecurrentes)
    .where(and(eq(facturasRecurrentes.id, recurrenteId), eq(facturasRecurrentes.teamId, teamId)))
    .limit(1);

  if (!facturaRecurrente) return NextResponse.json({ error: 'No encontrado' }, { status: 404 });
  return NextResponse.json({ facturaRecurrente });
}
