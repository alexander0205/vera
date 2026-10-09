import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth/api-guard';
import { celdaCsv, libroBanco } from '@/lib/contabilidad/bancos';
import { fechaValidaISO } from '@/lib/utils/format';

export const dynamic = 'force-dynamic';

const ETIQUETA_ORIGEN: Record<string, string> = {
  factura: 'Factura', pago: 'Cobro', nota: 'Nota', anulacion: 'Anulación', manual: 'Manual',
  pago_sueldos: 'Pago de nómina', pago_nomina: 'Pago TSS/DGII', nomina: 'Nómina', compra: 'Compra', gasto: 'Gasto',
};

/**
 * GET /api/contabilidad/bancos/libro?cuentaId=&desde=&hasta=[&formato=csv]
 * El libro banco de una cuenta: entradas, salidas, saldo corriente y estado de
 * conciliación. Con `formato=csv` se descarga para Excel.
 */
export async function GET(req: NextRequest) {
  const auth = await requirePermission('contabilidad:ver');
  if (!auth.ok) return auth.response;

  const sp = req.nextUrl.searchParams;
  const cuentaId = Number(sp.get('cuentaId'));
  if (!Number.isSafeInteger(cuentaId) || cuentaId <= 0) return NextResponse.json({ error: 'Elige una cuenta' }, { status: 400 });
  const desdeRaw = sp.get('desde'), hastaRaw = sp.get('hasta');
  const desde = desdeRaw ? fechaValidaISO(desdeRaw) : undefined;
  const hasta = hastaRaw ? fechaValidaISO(hastaRaw) : undefined;
  if ((desdeRaw && !desde) || (hastaRaw && !hasta)) return NextResponse.json({ error: 'Fecha inválida' }, { status: 400 });
  if (desde && hasta && desde > hasta) return NextResponse.json({ error: 'La fecha «desde» es posterior a «hasta»' }, { status: 400 });

  const libro = await libroBanco(auth.teamId, cuentaId, { desde, hasta });
  if (!libro) return NextResponse.json({ error: 'Cuenta no encontrada' }, { status: 404 });

  if (sp.get('formato') === 'csv') {
    const f = (c: number) => (c / 100).toFixed(2);
    const filas = [
      ['Fecha', 'Concepto', 'Tipo', 'Entra (depósitos)', 'Sale (retiros)', 'Saldo', 'Conciliado', 'Referencia'],
      ['', 'Saldo inicial', '', '', '', f(libro.saldoInicialCents), '', ''],
      ...libro.movimientos.map((m) => [
        m.fecha, m.concepto, ETIQUETA_ORIGEN[m.origenTipo] ?? m.origenTipo,
        m.entraCents ? f(m.entraCents) : '', m.saleCents ? f(m.saleCents) : '', f(m.saldoCents),
        m.conciliado ? 'Sí' : 'No', m.referencia ?? '',
      ]),
      ['', 'Total del período', '', f(libro.entradasCents), f(libro.salidasCents), f(libro.saldoFinalCents), '', ''],
    ];
    // BOM para que Excel abra los acentos bien.
    const csv = '﻿' + filas.map((r) => r.map(celdaCsv).join(',')).join('\r\n');
    const nombre = `libro-banco-${libro.cuenta.codigo}${desde ? `-${desde}` : ''}${hasta ? `-${hasta}` : ''}.csv`;
    return new NextResponse(csv, {
      headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${nombre}"`, 'Cache-Control': 'no-store' },
    });
  }
  return NextResponse.json(libro);
}
