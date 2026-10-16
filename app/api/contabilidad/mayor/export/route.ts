/**
 * GET /api/contabilidad/mayor/export — mayor de UNA cuenta a Excel, CSV o,
 * con `formato=pdf` (`inline=1` para imprimir), a PDF.
 *
 * Requiere `cuentaId`; acepta el periodo (desde/hasta) de la pantalla. Exporta
 * todos los movimientos de la cuenta con su saldo corriente, precedidos por el
 * saldo inicial del periodo. Sin paginar.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth/api-guard';
import { mayorGeneral } from '@/lib/contabilidad/reportes';
import { fechaValidaISO, fmtDOP, fmtFechaCorta, hoyRD } from '@/lib/utils/format';
import { empresaParaPdf, respuestaListadoPdf } from '@/lib/pdf/listado-respuesta';
import {
  DOP, ORIGEN_LABEL, nuevaHoja, estilarEncabezado, respuestaXlsx, respuestaCsv,
} from '@/lib/contabilidad/export-xlsx';

export const maxDuration = 60;

/** Tope alto: un mayor de una cuenta cabe de sobra; exportamos todo. */
const TODO = 100_000;

/**
 * Lo más que entra en el PDF. Una cuenta de banco o de ventas de una empresa
 * grande pasa de decenas de miles de movimientos, y react-pdf tarda unos 3 s
 * por cada 1,600 filas: sin tope se pasa de `maxDuration`. Excel y CSV llevan todo.
 */
const TOPE_PDF = 4000;

/** El código de la cuenta, apto para nombre de archivo (admite cualquier carácter). */
const paraArchivo = (codigo: string) => codigo.replace(/[^A-Za-z0-9._-]+/g, '-') || 'cuenta';

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

  const archivo = paraArchivo(mayor.cuenta.codigo);

  if (sp.get('formato') === 'pdf') {
    const { empresa, rnc } = await empresaParaPdf(auth.teamId);
    // Los primeros del período: así el saldo corriente sigue desde el inicial.
    const movimientos = mayor.movimientos.slice(0, TOPE_PDF);
    const nota = movimientos.length < mayor.movimientos.length
      ? `El PDF trae los primeros ${movimientos.length.toLocaleString('es-DO')} movimientos de ${mayor.movimientos.length.toLocaleString('es-DO')}; los totales y el saldo final son de todo el período. Para el mayor completo, acota las fechas o descarga Excel.`
      : undefined;
    return respuestaListadoPdf({
      empresa, rnc, nota,
      titulo: `Mayor · ${mayor.cuenta.codigo} ${mayor.cuenta.nombre}`,
      generado: fmtFechaCorta(hoyRD()),
      filtroTexto: desde && hasta ? `Del ${fmtFechaCorta(desde)} al ${fmtFechaCorta(hasta)}` : desde ? `Desde el ${fmtFechaCorta(desde)}` : hasta ? `Hasta el ${fmtFechaCorta(hasta)}` : 'Todas las fechas',
      kpis: [
        { label: 'Saldo inicial', valor: fmtDOP(mayor.saldoInicialCents) },
        { label: 'Debe', valor: fmtDOP(mayor.debeCents) },
        { label: 'Haber', valor: fmtDOP(mayor.haberCents) },
        { label: 'Saldo final', valor: fmtDOP(mayor.saldoFinalCents) },
      ],
      columnas: [
        { titulo: 'Fecha', ancho: '9%' },
        { titulo: 'Concepto', ancho: '27%' },
        { titulo: 'Origen', ancho: '9%' },
        { titulo: 'Detalle', ancho: '19%' },
        { titulo: 'Debe', ancho: '12%', alinear: 'right' },
        { titulo: 'Haber', ancho: '12%', alinear: 'right' },
        { titulo: 'Saldo', ancho: '12%', alinear: 'right', negrita: true },
      ],
      grupos: [{ filas: [
        { celdas: ['', 'Saldo inicial', '', '', '', '', fmtDOP(mayor.saldoInicialCents)] },
        ...movimientos.map((m) => ({ celdas: [
          fmtFechaCorta(m.fecha), m.concepto, ORIGEN_LABEL[m.origenTipo] ?? m.origenTipo, m.descripcion ?? '',
          m.debeCents > 0 ? fmtDOP(m.debeCents) : '', m.haberCents > 0 ? fmtDOP(m.haberCents) : '', fmtDOP(m.saldoCents),
        ] })),
      ] }],
      totales: { etiqueta: 'Totales', valores: { 4: fmtDOP(mayor.debeCents), 5: fmtDOP(mayor.haberCents), 6: fmtDOP(mayor.saldoFinalCents) } },
    }, `mayor-${archivo}_${hoyRD()}.pdf`, sp.get('inline') === '1');
  }

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
  return sp.get('formato') === 'csv'
    ? respuestaCsv(wb, `mayor-${archivo}.csv`)
    : respuestaXlsx(wb, `mayor-${archivo}.xlsx`);
}
