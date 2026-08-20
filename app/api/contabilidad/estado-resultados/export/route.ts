/**
 * GET /api/contabilidad/estado-resultados/export — a Excel (.xlsx)
 *
 * Acepta el periodo de la pantalla. Las tres secciones (ingresos, costos,
 * gastos) con sus cuentas y la utilidad neta.
 */

import { NextRequest } from 'next/server';
import { requirePermission } from '@/lib/auth/api-guard';
import { estadoResultados, type SeccionResultado } from '@/lib/contabilidad/estado-resultados';
import { fechaValidaISO } from '@/lib/utils/format';
import { DOP, nuevaHoja, estilarEncabezado, respuestaXlsx } from '@/lib/contabilidad/export-xlsx';

export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const auth = await requirePermission('contabilidad:ver');
  if (!auth.ok) return auth.response;

  const sp = req.nextUrl.searchParams;
  const er = await estadoResultados(auth.teamId, {
    desde: fechaValidaISO(sp.get('desde') ?? undefined),
    hasta: fechaValidaISO(sp.get('hasta') ?? undefined),
  });

  const { wb, ws } = nuevaHoja('Estado de resultados');
  ws.columns = [
    { header: 'Concepto', key: 'concepto', width: 46 },
    { header: 'Monto',    key: 'monto',    width: 18, style: { numFmt: DOP } },
  ];

  const seccion = (titulo: string, s: SeccionResultado) => {
    const cab = ws.addRow({ concepto: titulo, monto: s.totalCents / 100 });
    cab.font = { bold: true };
    for (const l of s.lineas) {
      ws.addRow({ concepto: `    ${l.codigo} ${l.nombre}`, monto: l.montoCents / 100 });
    }
  };

  const total = (label: string, cents: number) => {
    ws.addRow({ concepto: label, monto: cents / 100 }).font = { bold: true };
  };

  seccion('Ingresos', er.ingresos);
  if (er.costos.lineas.length > 0) {
    seccion('Costos', er.costos);
    total('Utilidad bruta', er.utilidadBrutaCents);
  }
  seccion('Gastos', er.gastos);
  ws.addRow({});
  total(er.utilidadNetaCents >= 0 ? 'UTILIDAD NETA' : 'PÉRDIDA NETA', er.utilidadNetaCents);

  estilarEncabezado(ws);
  return respuestaXlsx(wb, 'estado-resultados.xlsx');
}
