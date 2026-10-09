/**
 * GET /api/contabilidad/balance-general/export — a Excel (.xlsx)
 *
 * Acepta el periodo de la pantalla. Activo, pasivo y patrimonio con sus cuentas
 * (incluida la línea de resultado del ejercicio) y el cuadre.
 */

import { NextRequest } from 'next/server';
import { requirePermission } from '@/lib/auth/api-guard';
import { balanceGeneral, type SeccionBalanceGeneral } from '@/lib/contabilidad/balance-general';
import { fechaValidaISO } from '@/lib/utils/format';
import { DOP, nuevaHoja, estilarEncabezado, respuestaXlsx } from '@/lib/contabilidad/export-xlsx';

export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const auth = await requirePermission('contabilidad:ver');
  if (!auth.ok) return auth.response;

  const sp = req.nextUrl.searchParams;
  const bg = await balanceGeneral(auth.teamId, {
    desde: fechaValidaISO(sp.get('desde') ?? undefined),
    hasta: fechaValidaISO(sp.get('hasta') ?? undefined),
  });

  const { wb, ws } = nuevaHoja('Balance general');
  ws.columns = [
    { header: 'Concepto', key: 'concepto', width: 46 },
    { header: 'Monto',    key: 'monto',    width: 18, style: { numFmt: DOP } },
  ];

  const seccion = (titulo: string, s: SeccionBalanceGeneral, totalLabel: string) => {
    ws.addRow({ concepto: titulo }).font = { bold: true };
    for (const l of s.lineas) {
      const etiqueta = l.cuentaId !== null ? `    ${l.codigo} ${l.nombre}` : `    ${l.nombre}`;
      ws.addRow({ concepto: etiqueta, monto: l.montoCents / 100 });
    }
    ws.addRow({ concepto: totalLabel, monto: s.totalCents / 100 }).font = { bold: true };
  };

  seccion('ACTIVO', bg.activo, 'Total activo');
  ws.addRow({});
  seccion('PASIVO', bg.pasivo, 'Total pasivo');
  ws.addRow({});
  seccion('PATRIMONIO', bg.patrimonio, 'Total patrimonio');
  ws.addRow({});
  ws.addRow({
    concepto: bg.cuadra ? 'TOTAL PASIVO + PATRIMONIO (cuadra)' : 'TOTAL PASIVO + PATRIMONIO (NO CUADRA)',
    monto: bg.totalPasivoPatrimonioCents / 100,
  }).font = { bold: true };

  estilarEncabezado(ws);
  return respuestaXlsx(wb, 'balance-general.xlsx');
}
