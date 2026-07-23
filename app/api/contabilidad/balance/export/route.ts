/**
 * GET /api/contabilidad/balance/export — balance de comprobación a Excel (.xlsx)
 *
 * Acepta el periodo (desde/hasta) de la pantalla. Todas las cuentas con
 * movimientos, sus sumas y sus saldos, más la fila de totales que prueba el
 * cuadre.
 */

import { NextRequest } from 'next/server';
import { requirePermission } from '@/lib/auth/api-guard';
import { balanceComprobacion } from '@/lib/contabilidad/reportes';
import { fechaValidaISO } from '@/lib/utils/format';
import {
  DOP, nuevaHoja, estilarEncabezado, respuestaXlsx,
} from '@/lib/contabilidad/export-xlsx';

export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const auth = await requirePermission('contabilidad:ver');
  if (!auth.ok) return auth.response;

  const sp = req.nextUrl.searchParams;
  const balance = await balanceComprobacion(auth.teamId, {
    desde: fechaValidaISO(sp.get('desde') ?? undefined),
    hasta: fechaValidaISO(sp.get('hasta') ?? undefined),
  });

  const { wb, ws } = nuevaHoja('Balance de comprobación');
  ws.columns = [
    { header: 'Código',         key: 'codigo',   width: 12 },
    { header: 'Cuenta',         key: 'nombre',   width: 40 },
    { header: 'Debe',           key: 'debe',     width: 16, style: { numFmt: DOP } },
    { header: 'Haber',          key: 'haber',    width: 16, style: { numFmt: DOP } },
    { header: 'Saldo deudor',   key: 'deudor',   width: 16, style: { numFmt: DOP } },
    { header: 'Saldo acreedor', key: 'acreedor', width: 16, style: { numFmt: DOP } },
  ];

  for (const f of balance.filas) {
    ws.addRow({
      codigo:   f.codigo,
      nombre:   `${f.nombre}${f.anomala ? ' (saldo invertido)' : ''}`,
      debe:     f.debeCents > 0 ? f.debeCents / 100 : null,
      haber:    f.haberCents > 0 ? f.haberCents / 100 : null,
      deudor:   f.saldoDeudorCents > 0 ? f.saldoDeudorCents / 100 : null,
      acreedor: f.saldoAcreedorCents > 0 ? f.saldoAcreedorCents / 100 : null,
    });
  }

  ws.addRow({});
  const fin = ws.addRow({
    nombre:   balance.cuadra ? 'TOTALES (cuadra)' : 'TOTALES (NO CUADRA)',
    debe:     balance.totales.debeCents / 100,
    haber:    balance.totales.haberCents / 100,
    deudor:   balance.totales.saldoDeudorCents / 100,
    acreedor: balance.totales.saldoAcreedorCents / 100,
  });
  fin.font = { bold: true };

  estilarEncabezado(ws);
  return respuestaXlsx(wb, 'balance-comprobacion.xlsx');
}
