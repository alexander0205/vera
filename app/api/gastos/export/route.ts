/**
 * GET /api/gastos/export?formato=xlsx|pdf[&inline=1]&<filtro de la pantalla>
 *
 * Los gastos con el mismo filtro que la pantalla de Gastos (fechas, búsqueda,
 * categoría, tipo, estado), a Excel o a PDF. `inline=1` abre el PDF en el
 * visor del navegador en vez de descargarlo: es el botón «Imprimir».
 *
 * Los totales salen del mismo resumen que las tarjetas de la pantalla, así que
 * cuadran con lo que el usuario tiene delante aunque la lista se corte.
 */
import { NextRequest, NextResponse } from 'next/server';
import { renderToBuffer } from '@react-pdf/renderer';
import { createElement } from 'react';
import { eq } from 'drizzle-orm';
import { requirePermission } from '@/lib/auth/api-guard';
import { db } from '@/lib/db/drizzle';
import { teams } from '@/lib/db/schema';
import { resumenGastos } from '@/lib/compras/consultas';
import { cargarFilasGastos, estadoPagoTexto, METODO_LABEL } from '@/lib/compras/lista-gastos';
import { leerFiltroGastos, describirFiltroGastos } from '@/lib/compras/filtro-gastos';
import { DOP, nuevaHoja, estilarEncabezado, respuestaXlsx } from '@/lib/contabilidad/export-xlsx';
import { GastosPDF, type GastosPDFData } from '@/lib/pdf/GastosPDF';
import { fmtFechaCorta, hoyRD } from '@/lib/utils/format';

export const maxDuration = 60;

/** Lo más que baja un archivo. Los totales cuentan todo igual. */
const TOPE = 5000;

export async function GET(req: NextRequest) {
  const auth = await requirePermission('facturas:ver');
  if (!auth.ok) return auth.response;
  const teamId = auth.teamId;

  const sp = req.nextUrl.searchParams;
  const formato = sp.get('formato') === 'pdf' ? 'pdf' : 'xlsx';
  const filtro = leerFiltroGastos(sp);

  const [todas, resumen, [team]] = await Promise.all([
    cargarFilasGastos(teamId, filtro, TOPE),
    resumenGastos(teamId, filtro),
    db.select({ name: teams.name, razonSocial: teams.razonSocial, rnc: teams.rnc }).from(teams).where(eq(teams.id, teamId)).limit(1),
  ]);
  // Cada fuente trae hasta TOPE; juntas pueden pasarse.
  const filas = todas.slice(0, TOPE);
  const filtroTexto = describirFiltroGastos(filtro, fmtFechaCorta);
  const sufijo = [filtro.desde, filtro.hasta].filter(Boolean).join('_') || hoyRD();

  if (formato === 'pdf') {
    const data: GastosPDFData = {
      empresa: team?.razonSocial || team?.name || 'Empresa',
      rnc: team?.rnc ?? null,
      filtroTexto,
      generado: fmtFechaCorta(hoyRD()),
      totales: {
        gastado: resumen.totalCents / 100,
        cantidad: resumen.vivas,
        itbisAdelantar: resumen.itbisPorAdelantarCents / 100,
        retenciones: resumen.retencionesCents / 100,
        porPagar: resumen.porPagarCents / 100,
      },
      filas: filas.map((f) => ({
        fecha: fmtFechaCorta(f.fecha),
        proveedor: f.proveedor,
        rnc: f.rnc,
        comprobante: f.comprobante || '—',
        tipo: f.borrador ? `${f.tipo} · sin emitir` : f.tipo,
        categoria: f.categoria,
        estado: estadoPagoTexto(f),
        anulado: f.anulado,
        retenciones: f.retencionesCents / 100,
        monto: f.montoCents / 100,
      })),
      totalFilas: resumen.cantidad,
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const buffer = await renderToBuffer(createElement(GastosPDF, { data }) as any);
    const disposicion = sp.get('inline') === '1' ? 'inline' : 'attachment';
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `${disposicion}; filename="gastos_${sufijo}.pdf"`,
      },
    });
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

  return respuestaXlsx(wb, `gastos_${sufijo}.xlsx`);
}
