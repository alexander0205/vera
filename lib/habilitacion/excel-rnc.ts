/**
 * Lee los RNC emisores declarados dentro del Excel del Set de Pruebas.
 *
 * Hace falta porque `setPruebas.startRun()` de ecf-api NO recibe el
 * contribuyente: lo resuelve por la columna `RNCEmisor` de cada fila del
 * archivo, y la corrida se autoriza con la API key master. Sin verificar aquí,
 * un usuario de la empresa A puede subir un Excel con el RNC de la empresa B y
 * emitir e-CF de prueba contra la DGII bajo el RNC ajeno, consumiendo sus
 * secuencias. Los RNC dominicanos son públicos, así que no hay nada que
 * adivinar.
 *
 * Devuelve el conjunto de RNC distintos encontrados. Vacío = no se encontró la
 * columna (el llamador decide si eso es rechazo o no).
 */

import ExcelJS from 'exceljs';

/** Normaliza a solo dígitos: el Excel trae "1-31-98803-2", 131988032 o " 131988032 ". */
export function normalizarRnc(valor: unknown): string {
  if (valor == null) return '';
  const texto = typeof valor === 'object' && valor !== null && 'text' in valor
    ? String((valor as { text: unknown }).text)
    : String(valor);
  return texto.replace(/\D/g, '');
}

/** Encabezado que identifica la columna del emisor, sin importar formato. */
function esEncabezadoRncEmisor(valor: unknown): boolean {
  return String(valor ?? '')
    .toLowerCase()
    .replace(/[^a-z]/g, '')
    .includes('rncemisor');
}

export async function leerRncEmisores(buffer: Buffer): Promise<Set<string>> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as unknown as ArrayBuffer);

  const encontrados = new Set<string>();

  for (const ws of wb.worksheets) {
    // La fila de encabezados no siempre es la 1: algunas plantillas de la DGII
    // traen título y notas arriba. Se busca en las primeras filas.
    let filaEncabezado = 0;
    let colRnc = 0;

    for (let f = 1; f <= Math.min(ws.rowCount, 10) && !colRnc; f++) {
      const fila = ws.getRow(f);
      fila.eachCell({ includeEmpty: false }, (celda, col) => {
        if (!colRnc && esEncabezadoRncEmisor(celda.value)) {
          filaEncabezado = f;
          colRnc = col;
        }
      });
    }
    if (!colRnc) continue;

    for (let f = filaEncabezado + 1; f <= ws.rowCount; f++) {
      const rnc = normalizarRnc(ws.getRow(f).getCell(colRnc).value);
      if (rnc) encontrados.add(rnc);
    }
  }

  return encontrados;
}
