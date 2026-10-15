/**
 * GET /api/contabilidad/libro-diario/export — libro diario a Excel, CSV o,
 * con `formato=pdf` (`inline=1` para imprimir), a PDF con un bloque por asiento.
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
import { fechaValidaISO, fmtDOP, fmtFechaCorta, hoyRD } from '@/lib/utils/format';
import { empresaParaPdf, respuestaListadoPdf } from '@/lib/pdf/listado-respuesta';
import {
  DOP, ORIGEN_LABEL, nuevaHoja, estilarEncabezado, respuestaXlsx, respuestaCsv,
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

  if (sp.get('formato') === 'pdf') {
    const desde = fechaValidaISO(sp.get('desde') ?? undefined);
    const hasta = fechaValidaISO(sp.get('hasta') ?? undefined);
    // Un grupo por asiento, en el orden de la consulta (más nuevo primero).
    const grupos: { titulo: string; resumen: string; filas: { celdas: string[] }[] }[] = [];
    let actual: number | null = null;
    let debe = 0, haber = 0;
    for (const f of filas) {
      debe += f.debeCents; haber += f.haberCents;
      if (f.asientoId !== actual) {
        actual = f.asientoId;
        grupos.push({ titulo: `${fmtFechaCorta(f.fecha)} · ${f.concepto}`, resumen: ORIGEN_LABEL[f.origenTipo] ?? f.origenTipo, filas: [] });
      }
      grupos[grupos.length - 1].filas.push({ celdas: [
        `${f.cuentaCodigo} ${f.cuentaNombre}`, f.descripcion ?? '',
        f.debeCents > 0 ? fmtDOP(f.debeCents) : '', f.haberCents > 0 ? fmtDOP(f.haberCents) : '',
      ] });
    }
    const { empresa, rnc } = await empresaParaPdf(auth.teamId);
    return respuestaListadoPdf({
      empresa, rnc,
      titulo: 'Libro diario',
      generado: fmtFechaCorta(hoyRD()),
      filtroTexto: [
        desde && hasta ? `Del ${fmtFechaCorta(desde)} al ${fmtFechaCorta(hasta)}` : desde ? `Desde el ${fmtFechaCorta(desde)}` : hasta ? `Hasta el ${fmtFechaCorta(hasta)}` : 'Todas las fechas',
        origenRaw && ORIGENES.includes(origenRaw as OrigenTipo) ? `Origen: ${ORIGEN_LABEL[origenRaw] ?? origenRaw}` : null,
      ].filter(Boolean).join(' · '),
      kpis: [
        { label: 'Asientos', valor: String(grupos.length) },
        { label: 'Debe', valor: fmtDOP(debe) },
        { label: 'Haber', valor: fmtDOP(haber) },
        { label: debe === haber ? 'Cuadra' : 'Diferencia', valor: fmtDOP(Math.abs(debe - haber)) },
      ],
      columnas: [
        { titulo: 'Cuenta', ancho: '38%' },
        { titulo: 'Detalle', ancho: '32%' },
        { titulo: 'Debe', ancho: '15%', alinear: 'right' },
        { titulo: 'Haber', ancho: '15%', alinear: 'right' },
      ],
      grupos,
      totales: { etiqueta: 'Totales', valores: { 2: fmtDOP(debe), 3: fmtDOP(haber) } },
    }, `libro-diario_${hoyRD()}.pdf`, sp.get('inline') === '1');
  }

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
  return sp.get('formato') === 'csv'
    ? respuestaCsv(wb, 'libro-diario.csv')
    : respuestaXlsx(wb, 'libro-diario.xlsx');
}
