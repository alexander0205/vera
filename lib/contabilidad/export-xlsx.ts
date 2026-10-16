/**
 * lib/contabilidad/export-xlsx.ts — Utilidades compartidas por las rutas de
 * exportación de los reportes contables a Excel.
 *
 * Mismo formato de moneda y estilo de encabezado que el export de cartera del
 * Paso 1, para que todos los archivos que salen del sistema se vean iguales.
 */

import ExcelJS from 'exceljs';
import { NextResponse } from 'next/server';
import { protegerFormulaCsv } from '@/lib/export/csv';

/** Formato de moneda dominicana para las celdas numéricas. */
export const DOP = '"RD$"#,##0.00';

/** Etiquetas de origen de un asiento, para que el Excel no muestre el código. */
export const ORIGEN_LABEL: Record<string, string> = {
  factura: 'Factura', pago: 'Cobro', nota: 'Nota', anulacion: 'Anulación',
  manual: 'Manual',
};

/** Crea el libro con los metadatos comunes y devuelve la hoja lista. */
export function nuevaHoja(nombre: string): { wb: ExcelJS.Workbook; ws: ExcelJS.Worksheet } {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Zero';
  const ws = wb.addWorksheet(nombre);
  return { wb, ws };
}

/** Pinta la primera fila como encabezado (blanco sobre verde) y la congela. */
export function estilarEncabezado(ws: ExcelJS.Worksheet): void {
  ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0D9488' } };
  ws.views = [{ state: 'frozen', ySplit: 1 }];
}

/** Empaqueta el libro como respuesta HTTP con el nombre de archivo dado. */
export async function respuestaXlsx(wb: ExcelJS.Workbook, filename: string): Promise<NextResponse> {
  const buffer = await wb.xlsx.writeBuffer();
  return new NextResponse(buffer as ArrayBuffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'private, no-store',
    },
  });
}

/** CSV UTF-8 de la primera hoja, con las mismas filas y cifras que el Excel. */
export function csvDeHoja(ws: ExcelJS.Worksheet): string {
  const escapar = (valor: ExcelJS.CellValue): string => {
    let texto = valor == null ? '' : valor instanceof Date ? valor.toISOString().slice(0, 10) : String(valor);
    // Excel interpreta texto que empieza con estos caracteres como fórmula.
    if (typeof valor === 'string') texto = protegerFormulaCsv(texto);
    return /[",\r\n]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto;
  };
  const lineas: string[] = [];
  ws.eachRow({ includeEmpty: true }, (fila) => {
    lineas.push(Array.from({ length: ws.columnCount }, (_, i) => escapar(fila.getCell(i + 1).value)).join(','));
  });
  return `\uFEFF${lineas.join('\r\n')}\r\n`;
}

export function respuestaCsv(wb: ExcelJS.Workbook, filename: string): NextResponse {
  const ws = wb.worksheets[0];
  if (!ws) throw new Error('El reporte no tiene hoja');
  return new NextResponse(csvDeHoja(ws), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'private, no-store',
    },
  });
}
