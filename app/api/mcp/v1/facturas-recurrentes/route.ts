/**
 * GET /api/mcp/v1/facturas-recurrentes — solo lectura, autenticado por API key.
 * Consumido por el endpoint MCP (/api/mcp), nunca directo por el frontend.
 */
import { NextRequest, NextResponse } from 'next/server';
import { and, eq, ilike } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { facturasRecurrentes } from '@/lib/db/schema';
import { requireApiKey } from '@/lib/auth/api-key-guard';
import { CAMPOS_RECURRENTE } from '@/lib/mcp/campos-recurrentes';
import { idValido } from '@/lib/mcp/ids';

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

  // Un `?clientId=abc` acababa en `NaN` dentro de la consulta y daba un 500 sin
  // control. Se corta antes de tocar la base.
  const clienteFiltro = clientId ? idValido(clientId) : null;
  if (clientId && clienteFiltro === null) {
    return NextResponse.json({ error: 'clientId inválido' }, { status: 400 });
  }

  const condiciones = [eq(facturasRecurrentes.teamId, teamId)];
  if (estado) condiciones.push(eq(facturasRecurrentes.estado, estado));
  if (clienteFiltro !== null) condiciones.push(eq(facturasRecurrentes.clientId, clienteFiltro));
  if (q) condiciones.push(ilike(facturasRecurrentes.nombre, `%${q}%`));

  const facturasRecurrentesRows = await db
    .select(CAMPOS_RECURRENTE)
    .from(facturasRecurrentes)
    .where(and(...condiciones))
    .orderBy(facturasRecurrentes.nombre)
    .limit(limit)
    .offset(offset);

  return NextResponse.json({ facturasRecurrentes: facturasRecurrentesRows });
}
