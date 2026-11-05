/**
 * Abre el archivo de un estado de cuenta (CSV o Excel .xlsx) y lo deja como
 * matriz para `interpretarExtracto`. Separado de `extracto.ts` para que lo puro
 * no arrastre ExcelJS.
 */

import ExcelJS from 'exceljs';
import { ExtractoError, leerCsv, MAX_FILAS_EXTRACTO } from './extracto';
import { validarTamanoZip, ZipDemasiadoGrandeError } from './zip-tope';

/** Un estado de cuenta de miles de líneas en xlsx o csv no llega a esto. */
export const MAX_BYTES_EXTRACTO = 5 * 1024 * 1024;

/**
 * UTF-8 estricto y, si el archivo no lo es, windows-1252: lo que exporta Excel
 * en español («CSV (delimitado por comas)») y muchas bancas en línea. Sin esto
 * «Débito» llega como «D�bito» y no se reconoce la columna.
 */
export function decodificarTexto(bytes: Uint8Array): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder('windows-1252').decode(bytes);
  }
}

export async function leerMatrizExtracto(nombre: string, buffer: ArrayBuffer): Promise<unknown[][]> {
  const bytes = new Uint8Array(buffer);
  // Un .xlsx es un zip: empieza por «PK». Se decide por el contenido, no por la extensión que puso quien lo subió.
  const esXlsx = bytes.length > 4 && bytes[0] === 0x50 && bytes[1] === 0x4b;

  if (!esXlsx) {
    if (/\.xls$/i.test(nombre)) {
      throw new ExtractoError('Los .xls viejos no se pueden leer. Ábrelo en Excel y guárdalo como .xlsx o .csv.');
    }
    const texto = decodificarTexto(bytes);
    if (texto.includes('\u0000')) throw new ExtractoError('El archivo no es un CSV ni un Excel (.xlsx).');
    return leerCsv(texto);
  }

  // Antes de descomprimir nada: lo que el archivo DECLARA ocupar descomprimido tiene tope.
  try {
    validarTamanoZip(bytes);
  } catch (e) {
    if (e instanceof ZipDemasiadoGrandeError) throw new ExtractoError(e.message);
    throw e;
  }

  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(buffer);
  } catch {
    throw new ExtractoError('No se pudo leer el archivo como Excel (.xlsx). Guárdalo de nuevo desde Excel o expórtalo a .csv.');
  }
  const ws = wb.worksheets[0];
  if (!ws) throw new ExtractoError('El archivo no tiene ninguna hoja.');

  const matriz: unknown[][] = [];
  // Se corta antes de recorrer: una hoja con millones de filas no se lee entera.
  const tope = MAX_FILAS_EXTRACTO + 40;
  if (ws.rowCount > tope) {
    throw new ExtractoError(`El archivo trae más de ${MAX_FILAS_EXTRACTO} movimientos. Sube el estado de cuenta por tramos (por ejemplo, un mes).`);
  }
  for (let i = 1; i <= ws.rowCount; i++) {
    // `row.values` empieza en el índice 1: el 0 siempre viene vacío. Más de 40 columnas no es un extracto.
    matriz[i - 1] = (ws.getRow(i).values as unknown[]).slice(1, 41);
  }
  return matriz;
}
