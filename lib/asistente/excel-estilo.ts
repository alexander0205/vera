/**
 * Formato visual del Excel del asistente (ExcelJS). Aparte de `excel.ts` para
 * que la lógica de qué va en cada celda siga siendo pura y se pueda probar sin
 * un libro de verdad.
 *
 * Cada hoja de datos lleva:
 *   fila 1  título del reporte (el encabezado de la respuesta)
 *   fila 2  empresa · fecha
 *   fila 4  encabezado de columnas (azul de Zero, texto blanco, filtros)
 *   filas   datos con bandas, bordes finos y formatos numéricos
 *   última  fila de totales (solo columnas donde sumar tiene sentido)
 * Y la hoja se imprime horizontal y a una página de ancho, repitiendo el
 * encabezado.
 */

import type ExcelJS from 'exceljs';
import type { Celda, Hoja, Libro } from './excel';

const AZUL = 'FF3658E1';
const AZUL_SUAVE = 'FFEEF2FF';
const GRIS_TEXTO = 'FF6B7280';
const GRIS_BORDE = 'FFE5E7EB';
const BANDA = 'FFF8FAFC';
const BLANCO = 'FFFFFFFF';
const FUENTE = 'Calibri';

const borde: Partial<ExcelJS.Borders> = {
  top: { style: 'thin', color: { argb: GRIS_BORDE } },
  bottom: { style: 'thin', color: { argb: GRIS_BORDE } },
  left: { style: 'thin', color: { argb: GRIS_BORDE } },
  right: { style: 'thin', color: { argb: GRIS_BORDE } },
};

const valor = (c: Celda): ExcelJS.CellValue => c.valor;
const letra = (n: number) => {
  let s = '';
  for (let x = n; x > 0; x = Math.floor((x - 1) / 26)) s = String.fromCharCode(65 + ((x - 1) % 26)) + s;
  return s;
};

/** Ancho de columna según lo más largo que lleva (con tope). */
function anchos(h: Hoja): number[] {
  const columnas = Math.max(...h.filas.map((f) => f.length), 1);
  return Array.from({ length: columnas }, (_, j) => {
    const largo = Math.max(...h.filas.map((f) => {
      const c = f[j];
      if (!c) return 0;
      if (c.tipo === 'texto') return Math.min(c.valor.length, 60);
      return c.tipo === 'fecha' ? 11 : 17;
    }), 8);
    return Math.min(60, largo + 4);
  });
}

export function aplicarEstilo(wb: ExcelJS.Workbook, libro: Libro, meta: { empresa: string; generadoEn: string }): void {
  for (const h of libro.hojas) {
    const ws = wb.addWorksheet(h.nombre, {
      properties: { tabColor: { argb: h.tipo === 'info' ? 'FF9CA3AF' : AZUL } },
      views: [{ showGridLines: false }],
    });
    const columnas = Math.max(...h.filas.map((f) => f.length), 1);
    const w = anchos(h);
    w.forEach((a, j) => { ws.getColumn(j + 1).width = a; });
    const ultima = letra(columnas);

    // ── Encabezado del reporte ──
    const titulo = h.titulo ?? (h.tipo === 'texto' ? 'Respuesta del asistente' : 'Reporte');
    if (columnas > 1) ws.mergeCells(`A1:${ultima}1`);
    const t = ws.getCell('A1');
    t.value = titulo;
    t.font = { name: FUENTE, size: 15, bold: true, color: { argb: 'FF111827' } };
    t.alignment = { vertical: 'middle', wrapText: true };
    const anchoTotal = w.reduce((a, b) => a + b, 0);
    ws.getRow(1).height = Math.max(26, Math.ceil(titulo.length / Math.max(anchoTotal * 1.05, 20)) * 22);

    if (columnas > 1) ws.mergeCells(`A2:${ultima}2`);
    const sub = ws.getCell('A2');
    sub.value = `${meta.empresa}  ·  ${meta.generadoEn}`;
    sub.font = { name: FUENTE, size: 10, color: { argb: GRIS_TEXTO } };
    ws.getRow(3).height = 8;

    const inicio = 4; // fila del encabezado de columnas
    const PIE = h.tipo === 'datos' && h.sumables.some(Boolean);

    h.filas.forEach((fila, i) => {
      const row = ws.getRow(inicio + i);
      fila.forEach((c, j) => {
        const cell = row.getCell(j + 1);
        cell.value = valor(c);
        cell.font = { name: FUENTE, size: 11, color: { argb: 'FF111827' } };
        cell.border = borde;
        if (c.tipo === 'numero') cell.numFmt = c.formato;
        else if (c.tipo === 'fecha') cell.numFmt = 'dd/mm/yyyy';

        if (i === 0) {
          // Encabezado de columnas.
          cell.font = { name: FUENTE, size: 11, bold: true, color: { argb: BLANCO } };
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: AZUL } };
          cell.alignment = { vertical: 'middle', horizontal: h.numericas[j] ? 'right' : 'left', wrapText: true };
        } else {
          if (i % 2 === 0) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BANDA } };
          cell.alignment = {
            vertical: 'top',
            horizontal: h.numericas[j] ? 'right' : c.tipo === 'fecha' ? 'center' : 'left',
            wrapText: c.tipo === 'texto',
          };
        }
      });
      if (i === 0) row.height = 22;
    });

    if (h.tipo === 'info') {
      // Clave/valor: la clave en gris y negrita, sin bandas.
      h.filas.slice(1).forEach((_, i) => {
        const k = ws.getRow(inicio + 1 + i).getCell(1);
        k.font = { name: FUENTE, size: 11, bold: true, color: { argb: GRIS_TEXTO } };
      });
    }

    // ── Totales ──
    if (PIE) {
      const primera = inicio + 1;
      const fin = inicio + h.filas.length - 1;
      const pie = ws.getRow(fin + 1);
      for (let j = 0; j < columnas; j++) {
        const cell = pie.getCell(j + 1);
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: AZUL_SUAVE } };
        cell.border = { ...borde, top: { style: 'medium', color: { argb: AZUL } } };
        cell.font = { name: FUENTE, size: 11, bold: true, color: { argb: 'FF111827' } };
        if (j === 0) { cell.value = 'Total'; continue; }
        if (!h.sumables[j]) continue;
        const col = letra(j + 1);
        const celdas = h.filas.slice(1).map((f) => f[j]).filter((c): c is Extract<Celda, { tipo: 'numero' }> => c?.tipo === 'numero');
        const suma = celdas.reduce((a, c) => a + c.valor, 0);
        // Fórmula con su resultado ya calculado: Excel la recalcula; los visores sin motor muestran el valor.
        cell.value = { formula: `SUM(${col}${primera}:${col}${fin})`, result: suma };
        cell.numFmt = celdas[0]?.formato ?? '#,##0';
        cell.alignment = { horizontal: 'right', vertical: 'middle' };
      }
      pie.height = 22;
    }

    // ── Filtros, panel fijo e impresión ──
    if (h.tipo === 'datos' && h.filas.length > 2) {
      ws.autoFilter = { from: { row: inicio, column: 1 }, to: { row: inicio + h.filas.length - 1, column: columnas } };
    }
    ws.views = [{ state: 'frozen', ySplit: inicio, showGridLines: false }];
    ws.pageSetup = {
      orientation: columnas > 5 ? 'landscape' : 'portrait',
      paperSize: 9, // A4
      fitToPage: true, fitToWidth: 1, fitToHeight: 0,
      margins: { left: 0.5, right: 0.5, top: 0.6, bottom: 0.6, header: 0.3, footer: 0.3 },
      printTitlesRow: `${inicio}:${inicio}`,
    };
    ws.headerFooter.oddFooter = '&L&8Generado por el asistente de Zero&R&8Página &P de &N';
  }
}
