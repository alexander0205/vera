/**
 * GET /api/contabilidad/mayor/export — mayor de UNA cuenta a Excel (.xlsx)
 *
 * Requiere `cuentaId`; acepta el periodo (desde/hasta) de la pantalla. Exporta
 * todos los movimientos de la cuenta con su saldo corriente, precedidos por el
 * saldo inicial del periodo. Sin paginar.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth/api-guard';
import { mayorGeneral } from '@/lib/contabilidad/reportes';
import { fechaValidaISO } from '@/lib/utils/format';
import {
  DOP, ORIGEN_LABEL, nuevaHoja, estilarEncabezado, respuestaXlsx,
} from '@/lib/contabilidad/export-xlsx';

export const maxDuration = 60;

/** Tope alto: un mayor de una cuenta cabe de sobra; exportamos todo. */
const TODO = 100_000;

export async function GET(req: NextRequest) {
  const auth = await requirePermission('contabilidad:ver');
  if (!auth.ok) return auth.response;

  const sp = req.nextUrl.searchParams;
  const cuentaNum = Number(sp.get('cuentaId'));
  if (!Number.isInteger(cuentaNum) || cuentaNum <= 0) {
    return NextResponse.json({ error: 'Falta la cuenta' }, { status: 400 });
  }

  const desde = fechaValidaISO(sp.get('desde') ?? undefined);
  const hasta = fechaValidaISO(sp.get('hasta') ?? undefined);

  const mayor = await mayorGeneral(auth.teamId, cuentaNum, { desde, hasta, limit: TODO });
  if (!mayor) return NextResponse.json({ error: 'Cuenta no encontrada' }, { status: 404 });

  const { wb, ws } = nuevaHoja('Mayor');
  ws.columns = [
    { header: 'Fecha',    key: 'fecha',    width: 12 },
    { header: 'Concepto', key: 'concepto', width: 34 },
    { header: 'Origen',   key: 'origen',   width: 12 },
    { header: 'Detalle',  key: 'detalle',  width: 28 },
    { header: 'Debe',     key: 'debe',     width: 15, style: { numFmt: DOP } },
    { header: 'Haber',    key: 'haber',    width: 15, style: { numFmt: DOP } },
    { header: 'Saldo',    key: 'saldo',    width: 16, style: { numFmt: DOP } },
  ];

  // Fila de encabezado de la cuenta y del saldo inicial, para que el archivo se
  // lea solo igual que la pantalla.
  ws.addRow({ concepto: `${mayor.cuenta.codigo} ${mayor.cuenta.nombre}` }).font = { bold: true };
  ws.addRow({ detalle: 'Saldo inicial', saldo: mayor.saldoInicialCents / 100 });

  for (const m of mayor.movimientos) {
    ws.addRow({
      fecha:    m.fecha,
      concepto: m.concepto,
      origen:   ORIGEN_LABEL[m.origenTipo] ?? m.origenTipo,
      detalle:  m.descripcion ?? '',
      debe:     m.debeCents > 0 ? m.debeCents / 100 : null,
      haber:    m.haberCents > 0 ? m.haberCents / 100 : null,
      saldo:    m.saldoCents / 100,
    });
  }

  ws.addRow({});
  const fin = ws.addRow({
    detalle: 'TOTALES',
    debe:  mayor.debeCents / 100,
    haber: mayor.haberCents / 100,
    saldo: mayor.saldoFinalCents / 100,
  });
  fin.font = { bold: true };

  estilarEncabezado(ws);
  return respuestaXlsx(wb, `mayor-${mayor.cuenta.codigo}.xlsx`);
}
