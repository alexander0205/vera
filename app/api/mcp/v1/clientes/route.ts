/**
 * GET /api/mcp/v1/clientes — solo lectura, autenticado por API key.
 * Consumido por el endpoint MCP (/api/mcp), nunca directo por el frontend.
 */
import { NextRequest, NextResponse } from 'next/server';
import { and, eq, ilike, or } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { clients } from '@/lib/db/schema';
import { requireApiKey } from '@/lib/auth/api-key-guard';
import { CAMPOS_CLIENTE } from '@/lib/mcp/campos-clientes';

export async function GET(req: NextRequest) {
  const auth = await requireApiKey(req);
  if (!auth.ok) return auth.response;
  const { teamId } = auth;

  const sp = new URL(req.url).searchParams;
  const q = sp.get('q')?.trim();
  const limit = Math.min(Number(sp.get('limit')) || 200, 500);
  const offset = Math.max(Number(sp.get('offset')) || 0, 0);

  const condicion = q
    ? and(
        eq(clients.teamId, teamId),
        or(
          ilike(clients.razonSocial, `%${q}%`),
          ilike(clients.rnc, `%${q}%`),
          ilike(clients.email, `%${q}%`),
        ),
      )
    : eq(clients.teamId, teamId);

  const clientes = await db
    .select(CAMPOS_CLIENTE)
    .from(clients)
    .where(condicion)
    .orderBy(clients.razonSocial)
    .limit(limit)
    .offset(offset);

  return NextResponse.json({ clientes });
}
