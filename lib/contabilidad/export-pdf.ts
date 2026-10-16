/** PDF de los estados contables a partir de la misma hoja usada por Excel/CSV. */
import type ExcelJS from 'exceljs';
import { empresaParaPdf, respuestaListadoPdf } from '@/lib/pdf/listado-respuesta';
import { fmtDOP, fmtFechaCorta, hoyRD } from '@/lib/utils/format';

export async function respuestaPdfContable(wb: ExcelJS.Workbook, opciones: {
  teamId: number;
  titulo: string;
  filename: string;
  desde?: string;
  hasta?: string;
  anchos: string[];
  columnasMoneda: number[];
}) {
  const ws = wb.worksheets[0];
  if (!ws) throw new Error('El reporte no tiene hoja');
  const { empresa, rnc } = await empresaParaPdf(opciones.teamId);
  const moneda = new Set(opciones.columnasMoneda);
  const filas = Array.from({ length: Math.max(0, ws.rowCount - 1) }, (_, i) => {
    const fila = ws.getRow(i + 2);
    return { celdas: opciones.anchos.map((_, j) => {
      const valor = fila.getCell(j + 1).value;
      if (valor == null) return '';
      return typeof valor === 'number' && moneda.has(j) ? fmtDOP(Math.round(valor * 100)) : String(valor);
    }) };
  });
  const { desde, hasta } = opciones;
  const filtroTexto = desde && hasta
    ? `Del ${fmtFechaCorta(desde)} al ${fmtFechaCorta(hasta)}`
    : desde ? `Desde el ${fmtFechaCorta(desde)}`
    : hasta ? `Hasta el ${fmtFechaCorta(hasta)}` : 'Todas las fechas';

  return respuestaListadoPdf({
    empresa, rnc, titulo: opciones.titulo, filtroTexto,
    generado: fmtFechaCorta(hoyRD()), kpis: [],
    columnas: opciones.anchos.map((ancho, i) => ({
      titulo: ws.getRow(1).getCell(i + 1).text,
      ancho,
      alinear: moneda.has(i) ? 'right' as const : 'left' as const,
    })),
    grupos: [{ filas }],
  }, opciones.filename, false);
}
