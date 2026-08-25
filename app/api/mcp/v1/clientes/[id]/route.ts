/**
 * GET /api/mcp/v1/clientes/[id] — solo lectura, autenticado por API key.
 * Consumido por el endpoint MCP (/api/mcp), nunca directo por el frontend.
 */
import { NextRequest, NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { clients } from '@/lib/db/schema';
import { requireApiKey } from '@/lib/auth/api-key-guard';

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: Ctx) {
  const auth = await requireApiKey(req);
  if (!auth.ok) return auth.response;
  const { teamId } = auth;

  const { id } = await params;
  const clienteId = parseInt(id);
  if (isNaN(clienteId)) return NextResponse.json({ error: 'ID inválido' }, { status: 400 });

  const [cliente] = await db
    .select()
    .from(clients)
    .where(and(eq(clients.id, clienteId), eq(clients.teamId, teamId)))
    .limit(1);

  if (!cliente) return NextResponse.json({ error: 'No encontrado' }, { status: 404 });
  return NextResponse.json({ cliente });
}
