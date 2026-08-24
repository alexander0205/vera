/**
 * GET  /api/pos/comandas?mesaId= — comanda abierta de una mesa (+items) o null.
 * POST /api/pos/comandas         — abre (o devuelve) la comanda viva de la mesa.
 *
 * Requiere pos:vender. La venta se cobra reutilizando /api/ecf/emitir; aquí solo
 * se gestiona la cuenta abierta compartida.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireModuleAndPermission } from '@/lib/auth/api-guard';
import { getComandaAbierta, abrirComanda } from '@/lib/pos/restaurante';

export async function GET(req: NextRequest) {
  const auth = await requireModuleAndPermission('pos', 'pos:vender');
  if (!auth.ok) return auth.response;
  const mesaId = Number(new URL(req.url).searchParams.get('mesaId'));
  if (!mesaId) return NextResponse.json({ error: 'mesaId requerido' }, { status: 400 });
  const data = await getComandaAbierta(auth.teamId, mesaId);
  return NextResponse.json({ comanda: data?.comanda ?? null, items: data?.items ?? [] });
}

const abrirSchema = z.object({
  terminalId: z.number().int().positive(),
  mesaId:     z.number().int().positive(),
  meseroId:   z.number().int().positive().nullable().optional(),
  turnoId:    z.number().int().positive().nullable().optional(),
});

export async function POST(req: NextRequest) {
  const auth = await requireModuleAndPermission('pos', 'pos:vender');
  if (!auth.ok) return auth.response;
  const body = await req.json().catch(() => null);
  const parsed = abrirSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Datos inválidos', detalles: parsed.error.flatten() }, { status: 400 });
  }
  try {
    const comanda = await abrirComanda({
      teamId:     auth.teamId,
      terminalId: parsed.data.terminalId,
      mesaId:     parsed.data.mesaId,
      meseroId:   parsed.data.meseroId ?? null,
      turnoId:    parsed.data.turnoId ?? null,
    });
    const data = await getComandaAbierta(auth.teamId, parsed.data.mesaId);
    return NextResponse.json({ ok: true, comanda, items: data?.items ?? [] }, { status: 201 });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Error al abrir comanda';
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
