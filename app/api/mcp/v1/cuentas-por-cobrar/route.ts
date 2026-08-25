// app/api/mcp/v1/cuentas-por-cobrar/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getCuentasPorCobrar } from '@/lib/db/queries';
import { requireApiKey } from '@/lib/auth/api-key-guard';

export async function GET(req: NextRequest) {
  const auth = await requireApiKey(req);
  if (!auth.ok) return auth.response;
  const { teamId } = auth;

  const sp = new URL(req.url).searchParams;
  const clientId = sp.get('clientId');
  const soloVencidas = sp.get('soloVencidas') === 'true';
  const limit = Math.min(Number(sp.get('limit')) || 500, 2000);
  const offset = Math.max(Number(sp.get('offset')) || 0, 0);

  const resultado = await getCuentasPorCobrar(teamId, {
    ...(clientId ? { clientId: Number(clientId) } : {}),
    soloVencidas,
    limit,
    offset,
  });

  return NextResponse.json(resultado);
}
