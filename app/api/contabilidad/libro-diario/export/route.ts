/**
 * GET /api/contabilidad/libro-diario/export — libro diario a Excel (.xlsx)
 *
 * Acepta los MISMOS filtros que la pantalla (origenTipo, desde, hasta,
 * cuentaId), así que el archivo contiene exactamente lo que se está viendo.
 * Una fila por apunte, no por asiento: es el formato columnar que lee un
 * contador. Sin paginar — exporta todo lo filtrado.
 */

import { NextRequest } from 'next/server';
import { requirePermission } from '@/lib/auth/api-guard';
import {
  asientosParaExportar, ORIGENES, type OrigenTipo,
} from '@/lib/contabilidad/libro-diario';
import { fechaValidaISO } from '@/lib/utils/format';
import {
  DOP, ORIGEN_LABEL, nuevaHoja, estilarEncabezado, respuestaXlsx,
} from '@/lib/contabilidad/export-xlsx';

export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const auth = await requirePermission('contabilidad:ver');
  if (!auth.ok) return auth.response;

  const sp = req.nextUrl.searchParams;
  const origenRaw = sp.get('origenTipo');
  const cuentaNum = Number(sp.get('cuentaId'));

  const filas = await asientosParaExportar(auth.teamId, {
    origenTipo: ORIGENES.includes(origenRaw as OrigenTipo) ? (origenRaw as OrigenTipo) : undefined,
    desde: fechaValidaISO(sp.get('desde') ?? undefined),
    hasta: fechaValidaISO(sp.get('hasta') ?? undefined),
    cuentaId: Number.isInteger(cuentaNum) && cuentaNum > 0 ? cuentaNum : undefined,
  });

  const { wb, ws } = nuevaHoja('Libro diario');
  ws.columns = [
    { header: 'Fecha',       key: 'fecha',    width: 12 },
    { header: 'Concepto',    key: 'concepto', width: 32 },
    { header: 'Origen',      key: 'origen',   width: 12 },
    { header: 'Cuenta',      key: 'cuenta',   width: 40 },
    { header: 'Detalle',     key: 'detalle',  width: 30 },
    { header: 'Debe',        key: 'debe',     width: 15, style: { numFmt: DOP } },
    { header: 'Haber',       key: 'haber',    width: 15, style: { numFmt: DOP } },
  ];

  let totalDebe = 0, totalHaber = 0;
  for (const f of filas) {
    totalDebe += f.debeCents;
    totalHaber += f.haberCents;
    ws.addRow({
      fecha:    f.fecha,
      concepto: f.concepto,
      origen:   ORIGEN_LABEL[f.origenTipo] ?? f.origenTipo,
      cuenta:   `${f.cuentaCodigo} ${f.cuentaNombre}`,
      detalle:  f.descripcion ?? '',
      debe:     f.debeCents > 0 ? f.debeCents / 100 : null,
      haber:    f.haberCents > 0 ? f.haberCents / 100 : null,
    });
  }

  ws.addRow({});
  const fin = ws.addRow({ detalle: 'TOTALES', debe: totalDebe / 100, haber: totalHaber / 100 });
  fin.font = { bold: true };

  estilarEncabezado(ws);
  return respuestaXlsx(wb, 'libro-diario.xlsx');
}
