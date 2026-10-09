import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth/api-guard';
import { resumenEfectivo } from '@/lib/contabilidad/bancos';
import { fechaValidaISO } from '@/lib/utils/format';

export const dynamic = 'force-dynamic';

/** GET /api/contabilidad/bancos/efectivo?desde=&hasta= — cuánto se movió en efectivo (cajas 1101). */
export async function GET(req: NextRequest) {
  const auth = await requirePermission('contabilidad:ver');
  if (!auth.ok) return auth.response;
  const sp = req.nextUrl.searchParams;
  const desdeRaw = sp.get('desde'), hastaRaw = sp.get('hasta');
  const desde = desdeRaw ? fechaValidaISO(desdeRaw) : undefined;
  const hasta = hastaRaw ? fechaValidaISO(hastaRaw) : undefined;
  if ((desdeRaw && !desde) || (hastaRaw && !hasta)) return NextResponse.json({ error: 'Fecha inválida' }, { status: 400 });
  if (desde && hasta && desde > hasta) return NextResponse.json({ error: 'La fecha «desde» es posterior a «hasta»' }, { status: 400 });
  return NextResponse.json(await resumenEfectivo(auth.teamId, { desde, hasta }));
}
