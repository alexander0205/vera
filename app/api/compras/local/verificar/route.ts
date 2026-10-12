/**
 * GET /api/compras/local/verificar?ncf=&rnc= — qué es ese NCF y si ya está
 * registrado de ese proveedor, para avisarlo mientras se escribe.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth/api-guard';
import { verificarNcf } from '@/lib/compras/registrar';

export async function GET(req: NextRequest) {
  let auth = await requirePermission('productos:ver');
  if (!auth.ok) auth = await requirePermission('facturas:ver');
  if (!auth.ok) return auth.response;
  const sp = req.nextUrl.searchParams;
  const r = await verificarNcf(auth.teamId, sp.get('ncf') ?? '', sp.get('rnc'));
  return NextResponse.json({ info: r.info, repetidoId: r.repetidoId, emitido: r.emitido });
}
