/**
 * Export genérico de reportes financieros a Excel (.xlsx) con exceljs.
 *
 *   GET /api/reportes/export?report=<id>&desde=YYYY-MM-DD&hasta=YYYY-MM-DD[&g=dia|semana|mes]
 *
 * report ∈ tendencia | por-producto | por-cliente | por-metodo | cuentas-por-cobrar
 * Reutiliza la capa de queries — misma verdad que las pantallas.
 */
import { NextRequest, NextResponse } from 'next/server';
import ExcelJS from 'exceljs';
import { requirePermission } from '@/lib/auth/api-guard';
import { parseRango, METODO_LABEL, type Granularidad } from '@/lib/reportes/shared';
import {
  getTendencia, getIngresosPorProducto, getIngresosPorCliente,
  getIngresosPorMetodo, getAgingCxC,
  getVentasPorTipo, getVentasPorUsuario, getPagosPorUsuario,
} from '@/lib/reportes/queries';

export const maxDuration = 60;

const DOP = '"RD$"#,##0.00';

export async function GET(req: NextRequest) {
  const auth = await requirePermission('reportes:ver');
  if (!auth.ok) return auth.response;
  const teamId = auth.teamId;

  const sp = req.nextUrl.searchParams;
  const report = sp.get('report') ?? '';
  const { desde, hasta } = parseRango(sp.get('desde') ?? undefined, sp.get('hasta') ?? undefined);

  const wb = new ExcelJS.Workbook();
  wb.creator = 'EmiteDO';
  const ws = wb.addWorksheet('Reporte');
  let filename = 'reporte.xlsx';

  switch (report) {
    case 'tendencia': {
      const g = (sp.get('g') as Granularidad) ?? 'dia';
      const rows = await getTendencia(teamId, desde, hasta, g);
      ws.columns = [
        { header: 'Período', key: 'periodo', width: 16 },
        { header: 'Facturas', key: 'n', width: 12 },
        { header: 'ITBIS', key: 'itbis', width: 16, style: { numFmt: DOP } },
        { header: 'Ingresos', key: 'ingresos', width: 18, style: { numFmt: DOP } },
      ];
      rows.forEach(r => ws.addRow({ periodo: r.periodo, n: r.numFacturas, itbis: r.itbisCents / 100, ingresos: r.ingresosCents / 100 }));
      filename = `tendencia_${g}.xlsx`;
      break;
    }
    case 'por-producto': {
      const rows = await getIngresosPorProducto(teamId, desde, hasta);
      ws.columns = [
        { header: 'Producto', key: 'nombre', width: 40 },
        { header: 'Referencia', key: 'ref', width: 16 },
        { header: 'Unidades', key: 'u', width: 12 },
        { header: 'Facturas', key: 'n', width: 12 },
        { header: 'Ingresos (base)', key: 'ing', width: 18, style: { numFmt: DOP } },
        { header: '% acumulado', key: 'pct', width: 14, style: { numFmt: '0%' } },
      ];
      rows.forEach(r => ws.addRow({ nombre: r.nombre, ref: r.referencia ?? '', u: r.unidades, n: r.numFacturas, ing: r.ingresosCents / 100, pct: r.pctAcumulado }));
      filename = 'ingresos_por_producto.xlsx';
      break;
    }
    case 'por-cliente': {
      const rows = await getIngresosPorCliente(teamId, desde, hasta, 1000);
      ws.columns = [
        { header: 'Cliente', key: 'cliente', width: 40 },
        { header: 'RNC', key: 'rnc', width: 16 },
        { header: 'Facturas', key: 'n', width: 12 },
        { header: 'Ingresos', key: 'ing', width: 18, style: { numFmt: DOP } },
      ];
      rows.forEach(r => ws.addRow({ cliente: r.cliente, rnc: r.rnc ?? '', n: r.numFacturas, ing: r.ingresosCents / 100 }));
      filename = 'ingresos_por_cliente.xlsx';
      break;
    }
    case 'por-metodo': {
      const rows = await getIngresosPorMetodo(teamId, desde, hasta);
      ws.columns = [
        { header: 'Método', key: 'metodo', width: 24 },
        { header: 'Pagos', key: 'n', width: 12 },
        { header: 'Total', key: 'total', width: 18, style: { numFmt: DOP } },
      ];
      rows.forEach(r => ws.addRow({ metodo: METODO_LABEL[r.metodo] ?? r.metodo, n: r.numPagos, total: r.totalCents / 100 }));
      filename = 'ingresos_por_metodo.xlsx';
      break;
    }
    case 'cuentas-por-cobrar': {
      const aging = await getAgingCxC(teamId);
      ws.columns = [
        { header: 'Documento', key: 'encf', width: 20 },
        { header: 'Cliente', key: 'cliente', width: 40 },
        { header: 'Vence', key: 'vence', width: 14 },
        { header: 'Días vencido', key: 'dias', width: 14 },
        { header: 'Antigüedad', key: 'cubeta', width: 14 },
        { header: 'Saldo', key: 'saldo', width: 18, style: { numFmt: DOP } },
      ];
      aging.filas.forEach(f => ws.addRow({
        encf: f.encf, cliente: f.cliente, vence: f.fechaLimite ?? '', dias: f.diasVencido, cubeta: f.cubeta, saldo: f.saldoCents / 100,
      }));
      filename = 'cuentas_por_cobrar.xlsx';
      break;
    }
    case 'por-tipo': {
      const rows = await getVentasPorTipo(teamId, desde, hasta);
      ws.columns = [
        { header: 'Tipo e-CF', key: 'tipo', width: 12 },
        { header: 'Nombre', key: 'nombre', width: 30 },
        { header: 'Facturas', key: 'n', width: 12 },
        { header: 'ITBIS', key: 'itbis', width: 16, style: { numFmt: DOP } },
        { header: 'Total', key: 'total', width: 18, style: { numFmt: DOP } },
      ];
      rows.forEach(r => ws.addRow({ tipo: `e${r.tipoEcf}`, nombre: r.nombre, n: r.numFacturas, itbis: r.itbisCents / 100, total: r.ingresosCents / 100 }));
      filename = 'ingresos_por_tipo.xlsx';
      break;
    }
    case 'por-usuario': {
      const rows = await getVentasPorUsuario(teamId, desde, hasta);
      ws.columns = [
        { header: 'Usuario', key: 'nombre', width: 32 },
        { header: 'Facturas', key: 'n', width: 12 },
        { header: 'Facturado', key: 'total', width: 18, style: { numFmt: DOP } },
      ];
      rows.forEach(r => ws.addRow({ nombre: r.nombre, n: r.numFacturas, total: r.ingresosCents / 100 }));
      filename = 'ventas_por_usuario.xlsx';
      break;
    }
    case 'por-usuario-pago': {
      const rows = await getPagosPorUsuario(teamId, desde, hasta);
      ws.columns = [
        { header: 'Usuario', key: 'nombre', width: 32 },
        { header: 'Pagos', key: 'n', width: 12 },
        { header: 'Cobrado', key: 'total', width: 18, style: { numFmt: DOP } },
      ];
      rows.forEach(r => ws.addRow({ nombre: r.nombre, n: r.numPagos, total: r.totalCents / 100 }));
      filename = 'cobros_por_usuario.xlsx';
      break;
    }
    default:
      return NextResponse.json({ error: 'Reporte desconocido' }, { status: 400 });
  }

  // Estilo header
  ws.getRow(1).font = { bold: true };
  ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0D9488' } };
  ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };

  const buffer = await wb.xlsx.writeBuffer();
  return new NextResponse(buffer as ArrayBuffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
}
