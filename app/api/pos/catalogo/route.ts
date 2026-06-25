/**
 * GET /api/pos/catalogo?terminalId=N — productos vendibles en la grilla del POS
 * para la terminal dada (filtra por almacén de la terminal). Requiere pos:vender.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth/api-guard';
import { getTerminal } from '@/lib/pos/terminales';
import { getCatalogoPos } from '@/lib/pos/catalogo';

export async function GET(req: NextRequest) {
  const auth = await requirePermission('pos:vender');
  if (!auth.ok) return auth.response;
  const { teamId } = auth;

  const terminalId = Number(req.nextUrl.searchParams.get('terminalId'));
  if (!Number.isInteger(terminalId)) {
    return NextResponse.json({ error: 'terminalId requerido' }, { status: 400 });
  }

  const terminal = await getTerminal(teamId, terminalId);
  if (!terminal) return NextResponse.json({ error: 'Terminal no encontrada' }, { status: 404 });

  const productos = await getCatalogoPos(teamId, terminal.almacenId);
  return NextResponse.json({ terminal, productos });
}
