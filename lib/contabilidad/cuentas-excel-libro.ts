/**
 * lib/contabilidad/cuentas-excel-libro.ts — El archivo Excel del catálogo:
 * construirlo para descargar y convertirlo en filas al subirlo.
 *
 * Vive fuera de las rutas por una razón concreta: la prueba de ida y vuelta
 * (exportar → importar sin tocar nada → «0 cambios») tiene que correr el MISMO
 * código que las rutas. Si el libro se armara dentro del handler, la prueba
 * tendría que copiarlo, y una prueba que copia el código no prueba el código.
 */

import ExcelJS from 'exceljs';
import type { Cuenta } from './cuentas';
import {
  COLUMNAS_EXCEL, ETIQUETA_TIPO, ETIQUETA_NATURALEZA, MAX_FILAS_IMPORTACION,
} from './cuentas-excel';

/** Filas vacías con desplegable debajo de las existentes, para agregar cuentas. */
const FILAS_LIBRES = 200;

export function construirLibroCatalogo(cuentas: Cuenta[]): ExcelJS.Workbook {
  const codigoPorId = new Map(cuentas.map((c) => [c.id, c.codigo]));

  const wb = new ExcelJS.Workbook();
  wb.creator = 'Zero';
  const ws = wb.addWorksheet('Catálogo');
  ws.columns = [
    { header: COLUMNAS_EXCEL[0], key: 'codigo', width: 14 },
    { header: COLUMNAS_EXCEL[1], key: 'nombre', width: 40 },
    { header: COLUMNAS_EXCEL[2], key: 'tipo', width: 14 },
    { header: COLUMNAS_EXCEL[3], key: 'naturaleza', width: 13 },
    { header: COLUMNAS_EXCEL[4], key: 'padre', width: 20 },
    { header: COLUMNAS_EXCEL[5], key: 'imputable', width: 20 },
    { header: COLUMNAS_EXCEL[6], key: 'activa', width: 10 },
  ];
  // Mismo encabezado que el resto de exportaciones contables.
  ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0D9488' } };
  ws.views = [{ state: 'frozen', ySplit: 1 }];

  // El código como TEXTO en toda la columna. Sin esto Excel convierte «01.1» o
  // «1101-01» en números o fechas al editar, y el código que vuelve ya no casa
  // con ninguna cuenta.
  ws.getColumn(1).numFmt = '@';
  ws.getColumn(5).numFmt = '@';

  const ordenadas = [...cuentas].sort((a, b) => a.codigo.localeCompare(b.codigo));
  for (const c of ordenadas) {
    ws.addRow({
      codigo: c.codigo,
      nombre: c.nombre,
      tipo: ETIQUETA_TIPO[c.tipo] ?? c.tipo,
      naturaleza: ETIQUETA_NATURALEZA[c.naturaleza] ?? c.naturaleza,
      padre: c.cuentaPadreId != null ? (codigoPorId.get(c.cuentaPadreId) ?? '') : '',
      imputable: c.imputable ? 'Sí' : 'No',
      activa: c.activa ? 'Sí' : 'No',
    });
  }

  // Desplegables: un «Activos» o un «si» a mano funcionan, un «Activ» no, y es
  // mejor que Excel no deje escribirlo que rechazarlo al subir.
  const ultima = Math.min(ordenadas.length + 1 + FILAS_LIBRES, MAX_FILAS_IMPORTACION + 1);
  const lista = (valores: string[]) => ({
    type: 'list' as const,
    allowBlank: true,
    formulae: [`"${valores.join(',')}"`],
    showErrorMessage: true,
    errorTitle: 'Valor no válido',
    error: `Elige uno de: ${valores.join(', ')}.`,
  });
  const tipos = lista(Object.values(ETIQUETA_TIPO));
  const naturalezas = lista(Object.values(ETIQUETA_NATURALEZA));
  const siNo = lista(['Sí', 'No']);
  for (let r = 2; r <= ultima; r++) {
    ws.getCell(r, 3).dataValidation = tipos;
    ws.getCell(r, 4).dataValidation = naturalezas;
    ws.getCell(r, 6).dataValidation = siNo;
    ws.getCell(r, 7).dataValidation = siNo;
  }

  // Las reglas, dentro del propio archivo: quien lo edita no está mirando Zero.
  const ayuda = wb.addWorksheet('Cómo importar');
  ayuda.getColumn(1).width = 110;
  [
    'Cómo volver a subir este archivo',
    '',
    '• La columna Código es la llave. Un código que no existe se CREA; uno que ya existe se ACTUALIZA con lo que cambiaste.',
    '• Importar nunca borra: una cuenta que quites del archivo se queda como está en Zero. Para quitarla, desactívala (Activa = No).',
    '• Para una cuenta nueva hacen falta Código, Nombre y Tipo. Si dejas Naturaleza vacía se toma la que corresponde al tipo.',
    '• Código cuenta padre vacío = cuenta raíz. La cuenta padre tiene que agrupar (Acepta movimientos = No).',
    '• Una cuenta con movimientos contables no puede cambiar de tipo, ni dejar de aceptar movimientos.',
    '• Si una sola fila tiene un error no se aplica nada: Zero te dice qué fila revisar y el catálogo queda igual.',
    '• Antes de aplicar verás cuántas cuentas se crean y cuáles cambian.',
  ].forEach((texto, i) => {
    const celda = ayuda.getCell(i + 1, 1);
    celda.value = texto;
    celda.alignment = { wrapText: true, vertical: 'top' };
    if (i === 0) celda.font = { bold: true, size: 13 };
  });

  return wb;
}

/** Error de archivo que se le puede enseñar tal cual al usuario. */
export class ArchivoCatalogoError extends Error {}

/**
 * Carga un .xlsx y devuelve su hoja de catálogo como matriz (fila 0 = fila 1
 * de Excel). Toma la hoja «Catálogo» si existe —la que genera la exportación—,
 * si no la primera.
 */
export async function leerHojaCatalogo(buffer: ArrayBuffer): Promise<unknown[][]> {
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(buffer);
  } catch {
    throw new ArchivoCatalogoError(
      'No se pudo leer el archivo como Excel (.xlsx). Si lo tienes en .xls o .csv, ábrelo en Excel y guárdalo como .xlsx.',
    );
  }

  const ws = wb.getWorksheet('Catálogo') ?? wb.worksheets[0];
  if (!ws) throw new ArchivoCatalogoError('El archivo no tiene ninguna hoja.');

  const matriz: unknown[][] = [];
  ws.eachRow({ includeEmpty: true }, (row, numero) => {
    // `row.values` empieza en el índice 1: el 0 siempre viene vacío.
    matriz[numero - 1] = (row.values as unknown[]).slice(1);
  });
  return matriz;
}
