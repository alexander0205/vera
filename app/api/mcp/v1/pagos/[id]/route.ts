/**
 * GET /api/mcp/v1/pagos/[id] — solo lectura, autenticado por API key.
 * Consumido por el endpoint MCP (/api/mcp), nunca directo por el frontend.
 */
import { NextRequest, NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { pagosRecibidos, ecfDocuments, users } from '@/lib/db/schema';
import { requireApiKey } from '@/lib/auth/api-key-guard';
import { CAMPOS_PAGO } from '@/lib/mcp/campos-pagos';
import { idValido } from '@/lib/mcp/ids';

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: Ctx) {
  const auth = await requireApiKey(req);
  if (!auth.ok) return auth.response;
  const { teamId } = auth;

  const { id } = await params;
  const pagoId = idValido(id);
  if (pagoId === null) return NextResponse.json({ error: 'ID inválido' }, { status: 400 });

  const [pago] = await db
    .select({
      ...CAMPOS_PAGO,
      registradoPor: users.name,
      facturaCodigo: ecfDocuments.codigo,
      facturaEncf: ecfDocuments.encf,
    })
    .from(pagosRecibidos)
    .innerJoin(ecfDocuments, eq(ecfDocuments.id, pagosRecibidos.ecfDocumentId))
    .leftJoin(users, eq(users.id, pagosRecibidos.createdBy))
    // El teamId sale de la key, nunca de la petición: pedir el id de otra
    // empresa da 404, no el pago.
    .where(and(eq(pagosRecibidos.id, pagoId), eq(pagosRecibidos.teamId, teamId)))
    .limit(1);

  if (!pago) return NextResponse.json({ error: 'No encontrado' }, { status: 404 });
  return NextResponse.json({ pago });
}
