/**
 * GET /api/pagos/export?formato=xlsx|pdf[&inline=1]&<filtro de la pantalla>
 *
 * Los pagos recibidos con el mismo filtro que la pantalla «Pagos recibidos»
 * (fechas, búsqueda, método, origen, tipo de venta, DGII y agrupación), a Excel
 * o a PDF. `inline=1` abre el PDF en el visor del navegador: es el botón
 * «Imprimir».
 *
 * Mismos datos que la pantalla (`getPagosListado`, con su tope de 2000) y el
 * mismo filtro (`filtrarPagos`), así el archivo dice lo mismo que la tabla. Si
 * el rango llega al tope, el archivo lo dice.
 */
import { NextRequest } from 'next/server';
import { requirePermission } from '@/lib/auth/api-guard';
import { getPagosListado } from '@/lib/db/queries';
import { labelMetodo, esEfectivo } from '@/lib/pagos/metodos';
import {
  leerFiltroPagos, filtrarPagos, agruparPagos, describirFiltroPagos, ORIGEN_LABEL,
} from '@/lib/pagos/filtro-listado';
import { DOP, nuevaHoja, estilarEncabezado, respuestaXlsx } from '@/lib/contabilidad/export-xlsx';
import { empresaParaPdf, respuestaListadoPdf } from '@/lib/pdf/listado-respuesta';
import { fmtDOP, fmtFechaCorta, hoyRD } from '@/lib/utils/format';

export const maxDuration = 60;

/** El techo de `getPagosListado`: si llega a él, el rango trae más pagos. */
const TECHO = 2000;

export async function GET(req: NextRequest) {
  const auth = await requirePermission('pagos:ver');
  if (!auth.ok) return auth.response;
  const teamId = auth.teamId;

  const sp = req.nextUrl.searchParams;
  const formato = sp.get('formato') === 'pdf' ? 'pdf' : 'xlsx';
  const filtro = leerFiltroPagos(sp);

  const { pagos: todos } = await getPagosListado(teamId, { desde: filtro.desde, hasta: filtro.hasta });
  const pagos = filtrarPagos(todos, filtro);
  const grupos = agruparPagos(pagos, filtro.agrupar, fmtFechaCorta);

  const total = pagos.reduce((s, p) => s + p.monto, 0);
  const efectivo = pagos.filter((p) => esEfectivo(p.metodo)).reduce((s, p) => s + p.monto, 0);
  const promedio = pagos.length ? Math.round(total / pagos.length) : 0;
  const filtroTexto = describirFiltroPagos(filtro, fmtFechaCorta);
  const sufijo = [filtro.desde, filtro.hasta].filter(Boolean).join('_') || hoyRD();
  // Sin esta nota, un rango con más de 2000 pagos salía con el total y el
  // promedio bajos y nada que lo dijera.
  const nota = todos.length >= TECHO
    ? `Se muestran los ${TECHO.toLocaleString('es-DO')} pagos más recientes del rango y los totales son solo de esos; acota las fechas para ver el resto.`
    : undefined;
  const documento = (p: (typeof pagos)[number]) => p.docCodigo ?? (p.docId ? `#${p.docId}` : '—');
  const registradoPor = (p: (typeof pagos)[number]) => p.registradoPor ?? p.registradoPorEmail ?? '';

  if (formato === 'pdf') {
    const { empresa, rnc } = await empresaParaPdf(teamId);
    return respuestaListadoPdf({
      empresa, rnc, filtroTexto, nota,
      titulo: 'Pagos recibidos',
      generado: fmtFechaCorta(hoyRD()),
      kpis: [
        { label: 'Total cobrado', valor: fmtDOP(total) },
        { label: 'Pagos', valor: String(pagos.length) },
        { label: 'En efectivo', valor: fmtDOP(efectivo) },
        { label: 'Promedio', valor: fmtDOP(promedio) },
      ],
      columnas: [
        { titulo: 'Fecha', ancho: '8%' },
        // Sin monoespaciada: los códigos (FA-2026-…-000123) no caben y se
        // montaban sobre el cliente.
        { titulo: 'Documento', ancho: '15%' },
        { titulo: 'Cliente', ancho: '20%' },
        { titulo: 'Método', ancho: '9%' },
        { titulo: 'Origen', ancho: '9%' },
        { titulo: 'DGII', ancho: '7%' },
        { titulo: 'Referencia', ancho: '10%' },
        { titulo: 'Registrado por', ancho: '11%' },
        { titulo: 'Monto', ancho: '11%', alinear: 'right', negrita: true },
      ],
      grupos: grupos.map((g) => ({
        titulo: g.clave ?? undefined,
        resumen: g.clave ? `${g.pagos.length} pago${g.pagos.length === 1 ? '' : 's'} · ${fmtDOP(g.pagos.reduce((s, p) => s + p.monto, 0))}` : undefined,
        filas: g.pagos.map((p) => ({
          celdas: [
            fmtFechaCorta(p.fechaPago),
            { texto: documento(p), sub: p.docEncf && p.docEncf !== p.docCodigo ? p.docEncf : null },
            { texto: p.cliente ?? 'Consumidor Final', sub: p.rncComprador },
            labelMetodo(p.metodo),
            ORIGEN_LABEL[p.origen],
            p.enviadoDgii ? 'Enviado' : 'No enviado',
            p.referencia ?? '—',
            registradoPor(p) || '—',
            fmtDOP(p.monto),
          ],
        })),
      })),
      totales: { etiqueta: `Total cobrado · ${pagos.length} pago${pagos.length === 1 ? '' : 's'}`, valores: { 8: fmtDOP(total) } },
    }, `pagos_${sufijo}.pdf`, sp.get('inline') === '1');
  }

  const { wb, ws } = nuevaHoja('Pagos recibidos');
  ws.columns = [
    { header: 'Fecha', key: 'fecha', width: 12 },
    { header: 'Documento', key: 'documento', width: 16 },
    { header: 'NCF', key: 'ncf', width: 16 },
    { header: 'Cliente', key: 'cliente', width: 32 },
    { header: 'RNC', key: 'rnc', width: 14 },
    { header: 'Método', key: 'metodo', width: 16 },
    { header: 'Origen', key: 'origen', width: 16 },
    { header: 'DGII', key: 'dgii', width: 12 },
    { header: 'Referencia', key: 'referencia', width: 18 },
    { header: 'Cuadre', key: 'cuadre', width: 18 },
    { header: 'Registrado por', key: 'registradoPor', width: 22 },
    { header: 'Monto', key: 'monto', width: 16, style: { numFmt: DOP } },
  ];
  estilarEncabezado(ws);
  for (const g of grupos) {
    if (g.clave) {
      const cab = ws.addRow({ fecha: g.clave, monto: g.pagos.reduce((s, p) => s + p.monto, 0) / 100 });
      cab.font = { bold: true };
      cab.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F4F6' } };
    }
    for (const p of g.pagos) {
      ws.addRow({
        fecha: fmtFechaCorta(p.fechaPago),
        documento: documento(p),
        ncf: p.docEncf ?? '',
        cliente: p.cliente ?? 'Consumidor Final',
        rnc: p.rncComprador ?? '',
        metodo: labelMetodo(p.metodo),
        origen: ORIGEN_LABEL[p.origen],
        dgii: p.enviadoDgii ? 'Enviado' : 'No enviado',
        referencia: p.referencia ?? '',
        // Un cobro sin turno se hizo desde Facturación: no cae en ningún arqueo.
        cuadre: p.turnoCajaId ? (p.turnoNumeroCierre ?? `#${p.turnoCajaId}`) : 'Fuera de caja',
        registradoPor: registradoPor(p),
        monto: p.monto / 100,
      });
    }
  }
  ws.addRow({});
  const fila = ws.addRow({ cliente: `Total cobrado · ${pagos.length} pago${pagos.length === 1 ? '' : 's'}`, monto: total / 100 });
  fila.font = { bold: true };
  ws.addRow({ cliente: `En efectivo: ${fmtDOP(efectivo)} · Promedio: ${fmtDOP(promedio)}` });
  ws.addRow({ cliente: filtroTexto });
  if (nota) ws.addRow({ cliente: nota });

  return respuestaXlsx(wb, `pagos_${sufijo}.xlsx`);
}
