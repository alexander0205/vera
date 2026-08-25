/**
 * GET /api/mcp/v1/facturas/[id] — solo lectura, autenticado por API key.
 * Consumido por el endpoint MCP (/api/mcp), nunca directo por el frontend.
 */
import { NextRequest, NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { ecfDocuments } from '@/lib/db/schema';
import { requireApiKey } from '@/lib/auth/api-key-guard';
import { CAMPOS_FACTURA } from '@/lib/mcp/campos-facturas';
import { idValido } from '@/lib/mcp/ids';

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: Ctx) {
  const auth = await requireApiKey(req);
  if (!auth.ok) return auth.response;
  const { teamId } = auth;

  const { id } = await params;
  const facturaId = idValido(id);
  if (facturaId === null) return NextResponse.json({ error: 'ID inválido' }, { status: 400 });

  const [factura] = await db
    .select(CAMPOS_FACTURA)
    .from(ecfDocuments)
    .where(and(eq(ecfDocuments.id, facturaId), eq(ecfDocuments.teamId, teamId)))
    .limit(1);

  if (!factura) return NextResponse.json({ error: 'No encontrada' }, { status: 404 });
  return NextResponse.json({ factura });
}
