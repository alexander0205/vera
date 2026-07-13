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

  // La lista de precios se elige en el POS al momento de vender (no en la config
  // de la terminal). Query param gana sobre el valor legado de la terminal.
  const listaParam = req.nextUrl.searchParams.get('listaPreciosId');
  const listaPreciosId = listaParam ? Number(listaParam) : terminal.listaPreciosId;

  const productos = await getCatalogoPos(teamId, terminal.almacenId, listaPreciosId);
  return NextResponse.json({ terminal, productos });
}
