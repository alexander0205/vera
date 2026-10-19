/**
 * GET /api/gastos/export?formato=xlsx|pdf|csv[&inline=1]&<filtro de la pantalla>
 *
 * Los gastos con el mismo filtro que la pantalla de Gastos (fechas, búsqueda,
 * categoría, tipo, estado), a Excel, CSV o PDF. `inline=1` abre el PDF en el
 * visor del navegador en vez de descargarlo: es el botón «Imprimir».
 *
 * Los totales salen del mismo resumen que las tarjetas de la pantalla, así que
 * cuadran con lo que el usuario tiene delante aunque la lista se corte.
 */
import { NextRequest } from 'next/server';
import { requirePermission } from '@/lib/auth/api-guard';
import { resumenGastos } from '@/lib/compras/consultas';
import { cargarFilasGastos, estadoPagoTexto, METODO_LABEL } from '@/lib/compras/lista-gastos';
import { leerFiltroGastos, describirFiltroGastos } from '@/lib/compras/filtro-gastos';
import { DOP, nuevaHoja, estilarEncabezado, respuestaXlsx, respuestaCsv } from '@/lib/contabilidad/export-xlsx';
import { empresaParaPdf, respuestaListadoPdf } from '@/lib/pdf/listado-respuesta';
import { fmtDOP, fmtFechaCorta, hoyRD } from '@/lib/utils/format';

export const maxDuration = 60;

/** Lo más que baja un archivo. Los totales cuentan todo igual. */
const TOPE = 5000;

export async function GET(req: NextRequest) {
  const auth = await requirePermission('facturas:ver');
  if (!auth.ok) return auth.response;
  const teamId = auth.teamId;

  const sp = req.nextUrl.searchParams;
  const formato = sp.get('formato') === 'pdf' ? 'pdf' : sp.get('formato') === 'csv' ? 'csv' : 'xlsx';
  const filtro = leerFiltroGastos(sp);

  const [todas, resumen] = await Promise.all([
    cargarFilasGastos(teamId, filtro, TOPE),
    resumenGastos(teamId, filtro),
  ]);
  // Cada fuente trae hasta TOPE; juntas pueden pasarse.
  const filas = todas.slice(0, TOPE);
  const filtroTexto = describirFiltroGastos(filtro, fmtFechaCorta);
  const sufijo = [filtro.desde, filtro.hasta].filter(Boolean).join('_') || hoyRD();

  if (formato === 'pdf') {
    const { empresa, rnc } = await empresaParaPdf(teamId);
    return respuestaListadoPdf({
      empresa, rnc, filtroTexto,
      titulo: 'Reporte de gastos',
      generado: fmtFechaCorta(hoyRD()),
      kpis: [
        { label: 'Gastado', valor: fmtDOP(resumen.totalCents), sub: `${resumen.vivas} gasto${resumen.vivas === 1 ? '' : 's'}` },
        { label: 'ITBIS por adelantar', valor: fmtDOP(resumen.itbisPorAdelantarCents) },
        { label: 'Retenciones', valor: fmtDOP(resumen.retencionesCents) },
        { label: 'Por pagar', valor: fmtDOP(resumen.porPagarCents) },
      ],
      columnas: [
        { titulo: 'Fecha', ancho: '8%' },
        { titulo: 'Proveedor', ancho: '22%' },
        { titulo: 'Comprobante', ancho: '14%', mono: true },
        { titulo: 'Tipo', ancho: '13%' },
        { titulo: 'Categoría', ancho: '15%' },
        { titulo: 'Pago', ancho: '8%' },
        { titulo: 'Retenciones', ancho: '9%', alinear: 'right' },
        { titulo: 'Monto', ancho: '11%', alinear: 'right', negrita: true },
      ],
      grupos: [{
        filas: filas.map((f) => ({
          tachada: f.anulado,
          celdas: [
            fmtFechaCorta(f.fecha),
            { texto: f.proveedor, sub: f.rnc },
            f.comprobante || '—',
            f.borrador ? `${f.tipo} · sin emitir` : f.tipo,
            f.categoria,
            estadoPagoTexto(f),
            f.retencionesCents ? fmtDOP(f.retencionesCents) : '—',
            fmtDOP(f.montoCents),
          ],
        })),
      }],
      totales: { etiqueta: 'Total gastado (sin anulados)', valores: { 6: fmtDOP(resumen.retencionesCents), 7: fmtDOP(resumen.totalCents) } },
      nota: resumen.cantidad > filas.length
        ? `Se muestran ${filas.length} de ${resumen.cantidad} gastos. Acota el filtro para verlos todos; los totales sí incluyen todos.`
        : undefined,
    }, `gastos_${sufijo}.pdf`, sp.get('inline') === '1');
  }

  const { wb, ws } = nuevaHoja('Gastos');
  ws.columns = [
    { header: 'Fecha', key: 'fecha', width: 12 },
    { header: 'Proveedor', key: 'proveedor', width: 34 },
    { header: 'RNC', key: 'rnc', width: 14 },
    { header: 'Comprobante', key: 'comprobante', width: 18 },
    { header: 'Tipo', key: 'tipo', width: 26 },
    { header: 'Categoría', key: 'categoria', width: 30 },
    { header: 'Estado', key: 'estado', width: 12 },
    { header: 'Método', key: 'metodo', width: 22 },
    { header: 'Retenciones', key: 'retenciones', width: 16, style: { numFmt: DOP } },
    { header: 'Por pagar', key: 'saldo', width: 16, style: { numFmt: DOP } },
    { header: 'Monto', key: 'monto', width: 16, style: { numFmt: DOP } },
  ];
  estilarEncabezado(ws);
  for (const f of filas) {
    const metodo = f.pagado && f.metodo ? `${METODO_LABEL[f.metodo] ?? f.metodo}${f.cuenta ? ` · ${f.cuenta}` : ''}` : '';
    ws.addRow({
      fecha: fmtFechaCorta(f.fecha),
      proveedor: f.proveedor,
      rnc: f.rnc ?? '',
      comprobante: f.comprobante ?? '',
      tipo: f.borrador ? `${f.tipo} · sin emitir` : f.tipo,
      categoria: f.categoria === '—' ? '' : f.categoria,
      estado: estadoPagoTexto(f),
      metodo,
      retenciones: f.retencionesCents / 100,
      saldo: f.anulado ? 0 : f.saldoCents / 100,
      monto: f.montoCents / 100,
    });
  }
  ws.addRow({});
  const total = ws.addRow({
    proveedor: 'Total gastado (sin anulados)',
    retenciones: resumen.retencionesCents / 100,
    saldo: resumen.porPagarCents / 100,
    monto: resumen.totalCents / 100,
  });
  total.font = { bold: true };
  ws.addRow({ proveedor: filtroTexto });
  if (resumen.cantidad > filas.length) {
    ws.addRow({ proveedor: `Se muestran ${filas.length} de ${resumen.cantidad} gastos; los totales incluyen todos.` });
  }

  return formato === 'csv'
    ? respuestaCsv(wb, `gastos_${sufijo}.csv`)
    : respuestaXlsx(wb, `gastos_${sufijo}.xlsx`);
}
