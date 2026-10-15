/**
 * GET /api/facturas/export?formato=csv|xlsx|pdf[&inline=1]&<filtro de la tabla>
 *
 * Las facturas de venta con el MISMO filtro que la tabla (búsqueda, estado,
 * fechas, «Con NCs», maestros), a CSV (por defecto, el botón de siempre), Excel
 * o PDF. `inline=1` abre el PDF en el visor del navegador: botón «Imprimir».
 *
 * Antes este CSV solo aplicaba fechas y estado, incluía las notas de
 * crédito/débito que la tabla no enseña y daba por pagada toda factura de
 * contado. Ahora usa las condiciones y el estado de pago de la tabla
 * (`lib/facturas`), así el archivo trae lo mismo que se ve.
 */
import { NextRequest } from 'next/server';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { requirePermission } from '@/lib/auth/api-guard';
import { db } from '@/lib/db/drizzle';
import { ecfDocuments, teams, maestros, maestroValores } from '@/lib/db/schema';
import { leerFiltroFacturas, describirFiltroFacturas, estadoPagoFactura } from '@/lib/facturas/filtro-listado';
import { condicionesListadoFacturas, sqlPagado, sqlMoraPendiente, sqlNdPendiente } from '@/lib/facturas/consulta-listado';
import { DOP, nuevaHoja, estilarEncabezado, respuestaXlsx } from '@/lib/contabilidad/export-xlsx';
import { empresaParaPdf, respuestaListadoPdf } from '@/lib/pdf/listado-respuesta';
import { fmtDOP, fmtFechaCorta, fmtFechaRD, fmtCodigoCorto, hoyRD } from '@/lib/utils/format';

export const maxDuration = 60;

/** Lo más que baja un archivo. */
const TOPE = 5000;

const TIPO_LABELS: Record<string, string> = {
  '31': 'Factura de Crédito Fiscal', '32': 'Factura de Consumo', '33': 'Nota de Débito',
  '34': 'Nota de Crédito', '41': 'Compras', '43': 'Gastos Menores',
  '44': 'Reg. Único de Ingresos', '45': 'Gubernamental', '46': 'Exportaciones', '47': 'Otros',
  '00': 'Histórica', 'sin-ncf': 'Sin NCF',
};

const TIPO_PAGO_LABELS: Record<number, string> = {
  1: 'Contado', 2: 'Crédito', 3: 'Gratuito', 4: 'Uso o consumo',
};

// Estado del ciclo de vida e-CF (solo relevante con conexión a DGII).
const ESTADO_DGII_LABELS: Record<string, string> = {
  BORRADOR: 'Sin comprobante', EN_PROCESO: 'En proceso', ACEPTADO: 'Aceptado',
  ACEPTADO_CONDICIONAL: 'Aceptado condicional', RECHAZADO: 'Rechazado',
  ANULADO: 'Anulado', HISTORICA: 'Histórica',
};

const cts = (n: number) => (n / 100).toFixed(2);
const csv = (v: string | null | undefined) => `"${String(v ?? '').replace(/"/g, '""')}"`;
/** e-NCF real de la DGII; los borradores (BOR-…) no lo son. */
const ncfReal = (encf: string) => (/^BOR/i.test(encf) ? '' : encf);

export async function GET(req: NextRequest) {
  const auth = await requirePermission('facturas:exportar');
  if (!auth.ok) return auth.response;
  const teamId = auth.teamId;

  const sp = req.nextUrl.searchParams;
  const formato = sp.get('formato') === 'pdf' ? 'pdf' : sp.get('formato') === 'xlsx' ? 'xlsx' : 'csv';
  const filtro = leerFiltroFacturas(sp);

  const [[team], rows] = await Promise.all([
    // Conexión e-CF: ecfCodigoPublico null = empresa aún no registrada en ecf-api.
    // Sin conexión, el estado DGII no aplica → se omite del export.
    db.select({ ecfCodigoPublico: teams.ecfCodigoPublico }).from(teams).where(eq(teams.id, teamId)).limit(1),
    db.select({
      id:                   ecfDocuments.id,
      encf:                 ecfDocuments.encf,
      codigo:               ecfDocuments.codigo,
      tipoEcf:              ecfDocuments.tipoEcf,
      estado:               ecfDocuments.estado,
      tipoPago:             ecfDocuments.tipoPago,
      rncComprador:         ecfDocuments.rncComprador,
      razonSocialComprador: ecfDocuments.razonSocialComprador,
      montoTotal:           ecfDocuments.montoTotal,
      totalItbis:           ecfDocuments.totalItbis,
      totalRetenciones:     ecfDocuments.totalRetenciones,
      fechaEmision:         ecfDocuments.fechaEmision,
      fechaLimitePago:      ecfDocuments.fechaLimitePago,
      createdAt:            ecfDocuments.createdAt,
      pagado:               sqlPagado,
      moraPendiente:        sqlMoraPendiente,
      ndPendiente:          sqlNdPendiente,
    })
      .from(ecfDocuments)
      .where(and(...condicionesListadoFacturas(teamId, filtro)))
      .orderBy(desc(ecfDocuments.createdAt))
      .limit(TOPE),
  ]);
  const hasEcf = !!team?.ecfCodigoPublico;
  const hoy = hoyRD();

  const docs = rows.map((d) => {
    const pagado = Number(d.pagado);
    const fechaLimite = d.fechaLimitePago ? String(d.fechaLimitePago).slice(0, 10) : null;
    const ep = estadoPagoFactura({
      estado: d.estado, tipoEcf: d.tipoEcf, tipoPago: d.tipoPago, montoTotal: d.montoTotal,
      totalRetenciones: d.totalRetenciones, pagado, fechaLimitePago: fechaLimite,
      moraPendiente: Number(d.moraPendiente), ndPendiente: Number(d.ndPendiente),
    }, hoy);
    return { ...d, pagado, ep, anulada: d.estado === 'ANULADO' };
  });

  const sufijo = [filtro.desde, filtro.hasta].filter(Boolean).join('_') || hoy;

  if (formato === 'csv') {
    const header = [
      'Código', 'e-NCF', 'Tipo', 'Estado de pago',
      ...(hasEcf ? ['Estado DGII'] : []),
      'Cliente', 'RNC Cliente', 'Condición de pago',
      'Monto Total', 'Pagado', 'Saldo', 'ITBIS',
      'Fecha Emisión', 'Fecha Creación',
    ].join(',');
    const lines = docs.map((d) => [
      csv(d.codigo),
      ncfReal(d.encf),
      TIPO_LABELS[d.tipoEcf] ?? d.tipoEcf,
      d.ep.etiqueta,
      ...(hasEcf ? [ESTADO_DGII_LABELS[d.estado] ?? d.estado] : []),
      csv(d.razonSocialComprador),
      d.rncComprador ?? '',
      TIPO_PAGO_LABELS[d.tipoPago ?? 1] ?? '',
      cts(d.montoTotal),
      cts(d.pagado),
      cts(d.ep.saldo),
      cts(d.totalItbis),
      d.fechaEmision.toISOString().slice(0, 10),
      d.createdAt.toISOString().slice(0, 10),
    ].join(','));
    // BOM para que Excel muestre acentos (ñ, é…) correctamente.
    const body = '﻿' + [header, ...lines].join('\n');
    return new Response(body, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="facturas_${sufijo}.csv"`,
      },
    });
  }

  // Totales de lo vivo (una anulada no se vendió).
  const vivas = docs.filter((d) => !d.anulada);
  const facturado = vivas.reduce((s, d) => s + d.montoTotal, 0);
  const cobrado = vivas.reduce((s, d) => s + d.pagado, 0);
  const porCobrar = vivas.reduce((s, d) => s + d.ep.saldo, 0);
  const itbis = vivas.reduce((s, d) => s + d.totalItbis, 0);

  // Nombres de los valores de maestro filtrados, para describir el filtro.
  const nombresMaestro = new Map<number, string>();
  if (filtro.maestroValorIds?.length) {
    const vals = await db.select({ id: maestroValores.id, valor: maestroValores.valor, maestro: maestros.nombre })
      .from(maestroValores)
      .innerJoin(maestros, eq(maestros.id, maestroValores.maestroId))
      .where(and(eq(maestros.teamId, teamId), inArray(maestroValores.id, filtro.maestroValorIds)));
    for (const v of vals) nombresMaestro.set(v.id, `${v.maestro}: ${v.valor}`);
  }
  const filtroTexto = describirFiltroFacturas(filtro, fmtFechaCorta, nombresMaestro);
  const pagoTexto = (d: (typeof docs)[number]) => (d.ep.detalle ? `${d.ep.etiqueta} (${d.ep.detalle})` : d.ep.etiqueta);
  const nota = docs.length === TOPE ? `Se muestran las ${TOPE} facturas más recientes; acota el filtro para ver el resto.` : undefined;

  if (formato === 'pdf') {
    const { empresa, rnc } = await empresaParaPdf(teamId);
    const columnas = [
      { titulo: 'Fecha', ancho: '8%' },
      { titulo: 'Código', ancho: hasEcf ? '14%' : '16%' },
      { titulo: 'Tipo', ancho: '12%' },
      { titulo: 'Cliente', ancho: hasEcf ? '20%' : '24%' },
      ...(hasEcf ? [{ titulo: 'DGII', ancho: '8%' }] : []),
      { titulo: 'Pago', ancho: '10%' },
      { titulo: 'ITBIS', ancho: '8%', alinear: 'right' as const },
      { titulo: 'Total', ancho: '10%', alinear: 'right' as const, negrita: true },
      { titulo: 'Saldo', ancho: '10%', alinear: 'right' as const },
    ];
    const iItbis = columnas.length - 3;
    return respuestaListadoPdf({
      empresa, rnc, filtroTexto, nota,
      titulo: 'Facturas de venta',
      generado: fmtFechaCorta(hoy),
      kpis: [
        { label: 'Facturado', valor: fmtDOP(facturado), sub: `${vivas.length} factura${vivas.length === 1 ? '' : 's'}` },
        { label: 'Cobrado', valor: fmtDOP(cobrado) },
        { label: 'Por cobrar', valor: fmtDOP(porCobrar) },
        { label: 'ITBIS', valor: fmtDOP(itbis) },
      ],
      columnas,
      grupos: [{
        filas: docs.map((d) => ({
          tachada: d.anulada,
          celdas: [
            fmtFechaRD(d.fechaEmision),
            // La cola del código, como en la tabla: el prefijo es igual en todas las
            // filas y, entero, no cabe y se monta sobre la columna de al lado.
            { texto: d.codigo ? fmtCodigoCorto(d.codigo) : `#${d.id}`, sub: ncfReal(d.encf) || null },
            TIPO_LABELS[d.tipoEcf] ?? d.tipoEcf,
            { texto: d.razonSocialComprador || 'Consumidor Final', sub: d.rncComprador },
            ...(hasEcf ? [ESTADO_DGII_LABELS[d.estado] ?? d.estado] : []),
            pagoTexto(d),
            fmtDOP(d.totalItbis),
            fmtDOP(d.montoTotal),
            d.ep.saldo ? fmtDOP(d.ep.saldo) : '—',
          ],
        })),
      }],
      totales: {
        etiqueta: 'Total (sin anuladas)',
        valores: { [iItbis]: fmtDOP(itbis), [iItbis + 1]: fmtDOP(facturado), [iItbis + 2]: fmtDOP(porCobrar) },
      },
    }, `facturas_${sufijo}.pdf`, sp.get('inline') === '1');
  }

  const { wb, ws } = nuevaHoja('Facturas de venta');
  ws.columns = [
    { header: 'Fecha emisión', key: 'fecha', width: 13 },
    { header: 'Código', key: 'codigo', width: 22 },
    { header: 'e-NCF', key: 'encf', width: 16 },
    { header: 'Tipo', key: 'tipo', width: 24 },
    { header: 'Cliente', key: 'cliente', width: 32 },
    { header: 'RNC', key: 'rnc', width: 14 },
    ...(hasEcf ? [{ header: 'Estado DGII', key: 'dgii', width: 18 }] : []),
    { header: 'Estado de pago', key: 'pago', width: 18 },
    { header: 'Condición', key: 'condicion', width: 13 },
    { header: 'Vence', key: 'vence', width: 12 },
    { header: 'ITBIS', key: 'itbis', width: 14, style: { numFmt: DOP } },
    { header: 'Total', key: 'total', width: 16, style: { numFmt: DOP } },
    { header: 'Cobrado', key: 'cobrado', width: 16, style: { numFmt: DOP } },
    { header: 'Saldo', key: 'saldo', width: 16, style: { numFmt: DOP } },
  ];
  estilarEncabezado(ws);
  for (const d of docs) {
    const row = ws.addRow({
      fecha: fmtFechaRD(d.fechaEmision),
      codigo: d.codigo ?? `#${d.id}`,
      encf: ncfReal(d.encf),
      tipo: TIPO_LABELS[d.tipoEcf] ?? d.tipoEcf,
      cliente: d.razonSocialComprador || 'Consumidor Final',
      rnc: d.rncComprador ?? '',
      dgii: ESTADO_DGII_LABELS[d.estado] ?? d.estado,
      pago: pagoTexto(d),
      condicion: TIPO_PAGO_LABELS[d.tipoPago ?? 1] ?? '',
      vence: d.fechaLimitePago ? fmtFechaCorta(String(d.fechaLimitePago)) : '',
      itbis: d.totalItbis / 100,
      total: d.montoTotal / 100,
      cobrado: d.pagado / 100,
      saldo: d.ep.saldo / 100,
    });
    if (d.anulada) row.font = { color: { argb: 'FF9CA3AF' }, strike: true };
  }
  ws.addRow({});
  const tot = ws.addRow({
    cliente: `Total (sin anuladas) · ${vivas.length} factura${vivas.length === 1 ? '' : 's'}`,
    itbis: itbis / 100, total: facturado / 100, cobrado: cobrado / 100, saldo: porCobrar / 100,
  });
  tot.font = { bold: true };
  ws.addRow({ cliente: filtroTexto });
  if (nota) ws.addRow({ cliente: nota });

  return respuestaXlsx(wb, `facturas_${sufijo}.xlsx`);
}
