/**
 * El archivo Excel de empleados: construirlo para descargar (la plantilla, con
 * los empleados que ya hay) y convertirlo en filas al subirlo. Vive fuera de las
 * rutas para que la prueba de ida y vuelta corra el MISMO código que ellas.
 */

import ExcelJS from 'exceljs';
import { COLUMNAS_EMPLEADOS, MAX_FILAS_EMPLEADOS } from './empleados-excel';

/** Lo que la plantilla necesita saber de un empleado que ya existe. */
export interface EmpleadoParaPlantilla {
  cedula: string | null;
  nombres: string;
  apellidos: string;
  cargo: string | null;
  salarioBaseCents: number;
  frecuenciaPago: string;
  fechaIngreso: string | null;
  bancoNombre: string | null;
  bancoCuenta: string | null;
  bancoTipoCuenta: string | null;
  afp: string | null;
  ars: string | null;
  vacacionesDias: number | null;
  /** Incentivo fijo vigente, en centavos; 0 o null si no tiene. */
  incentivoCents: number | null;
  telefono: string | null;
  email: string | null;
}

const FILAS_LIBRES = 100;
/** Filas de la hoja que se aceptan recorrer: los empleados más un margen de títulos y filas en blanco. */
const MAX_FILAS_HOJA = MAX_FILAS_EMPLEADOS + 500;
const ETIQUETA_FRECUENCIA: Record<string, string> = { mensual: 'Mensual', quincenal: 'Quincenal', semanal: 'Semanal' };
const ETIQUETA_TIPO_CUENTA: Record<string, string> = { ahorros: 'Ahorros', corriente: 'Corriente' };

/** Centavos → pesos como NÚMERO de Excel (para que se pueda sumar), sin basura de decimales. */
const pesos = (cents: number | null | undefined) => (cents ? Math.round(cents) / 100 : null);

export function construirLibroEmpleados(empleados: EmpleadoParaPlantilla[]): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Zero';
  const ws = wb.addWorksheet('Empleados');
  const anchos = [15, 18, 20, 22, 18, 14, 14, 18, 20, 12, 12, 14, 12, 18, 14, 28];
  ws.columns = COLUMNAS_EMPLEADOS.map((header, i) => ({ header, key: `c${i}`, width: anchos[i] }));
  ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0D9488' } };
  ws.getRow(1).alignment = { wrapText: true, vertical: 'middle' };
  ws.views = [{ state: 'frozen', ySplit: 1, xSplit: 1 }];

  // Cédula, cuenta y teléfono como TEXTO en toda la columna: sin esto Excel los
  // vuelve números y se come el cero inicial de la cédula (001-…).
  for (const col of [1, 9, 15]) ws.getColumn(col).numFmt = '@';
  ws.getColumn(5).numFmt = '#,##0.00';
  ws.getColumn(14).numFmt = '#,##0.00';
  ws.getColumn(7).numFmt = 'dd/mm/yyyy';

  const ordenados = [...empleados].sort((a, b) => `${a.apellidos} ${a.nombres}`.localeCompare(`${b.apellidos} ${b.nombres}`));
  for (const e of ordenados) {
    ws.addRow([
      e.cedula ?? '',
      e.nombres,
      e.apellidos,
      e.cargo ?? '',
      pesos(e.salarioBaseCents),
      ETIQUETA_FRECUENCIA[e.frecuenciaPago] ?? e.frecuenciaPago,
      e.fechaIngreso ? new Date(`${e.fechaIngreso}T00:00:00Z`) : null,
      e.bancoNombre ?? '',
      e.bancoCuenta ?? '',
      e.bancoTipoCuenta ? (ETIQUETA_TIPO_CUENTA[e.bancoTipoCuenta] ?? e.bancoTipoCuenta) : '',
      e.afp ?? '',
      e.ars ?? '',
      e.vacacionesDias ?? null,
      pesos(e.incentivoCents),
      e.telefono ?? '',
      e.email ?? '',
    ]);
  }

  // Desplegables en las filas libres: más fácil que Excel no deje escribir «Quinsenal».
  const ultima = Math.min(ordenados.length + 1 + FILAS_LIBRES, MAX_FILAS_EMPLEADOS + 1);
  const lista = (valores: string[]) => ({
    type: 'list' as const, allowBlank: true, formulae: [`"${valores.join(',')}"`],
    showErrorMessage: true, errorTitle: 'Valor no válido', error: `Elige uno de: ${valores.join(', ')}.`,
  });
  const frecuencias = lista(Object.values(ETIQUETA_FRECUENCIA));
  const tipos = lista(Object.values(ETIQUETA_TIPO_CUENTA));
  for (let r = 2; r <= ultima; r++) {
    ws.getCell(r, 6).dataValidation = frecuencias;
    ws.getCell(r, 10).dataValidation = tipos;
  }

  const ayuda = wb.addWorksheet('Cómo importar');
  ayuda.getColumn(1).width = 115;
  [
    'Cómo llenar y volver a subir este archivo',
    '',
    '• La cédula (11 dígitos) es la llave. Una cédula que no existe CREA al empleado; una que ya existe lo ACTUALIZA con lo que cambiaste.',
    '• Para un empleado nuevo hacen falta Cédula, Nombres, Apellidos y Salario mensual. Lo demás es opcional.',
    '• Una celda vacía no borra lo que ya está en Zero: solo cambia lo que escribes.',
    '• Importar nunca da de baja a nadie. Quien quites del archivo se queda como está.',
    '• El salario es MENSUAL, en pesos, solo el número (35000 o 35,000.00). Si la frecuencia es Quincenal se paga la mitad cada quincena.',
    '• La fecha de ingreso va como día/mes/año (15/01/2026). La cuenta bancaria necesita su Tipo de cuenta (Ahorros o Corriente).',
    '• «Incentivo fijo por corrida» es lo que se suma a cada nómina (mensual o quincenal). Déjalo vacío si no tiene.',
    '• Si una sola fila tiene un error no se aplica nada: Zero te dice qué fila revisar y todo queda igual.',
    '• Antes de aplicar verás cuántos empleados se crean, cuáles cambian y cada cambio de salario.',
  ].forEach((texto, i) => {
    const c = ayuda.getCell(i + 1, 1);
    c.value = texto;
    c.alignment = { wrapText: true, vertical: 'top' };
    if (i === 0) c.font = { bold: true, size: 13 };
  });

  return wb;
}

/** Error de archivo que se le puede enseñar tal cual al usuario. */
export class ArchivoEmpleadosError extends Error {}

/** Carga un .xlsx y devuelve su hoja «Empleados» (o la primera) como matriz; fila 0 = fila 1 de Excel. */
export async function leerHojaEmpleados(buffer: ArrayBuffer): Promise<unknown[][]> {
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(buffer);
  } catch {
    throw new ArchivoEmpleadosError(
      'No se pudo leer el archivo como Excel (.xlsx). Si lo tienes en .xls o .csv, ábrelo en Excel y guárdalo como .xlsx.',
    );
  }
  const ws = wb.getWorksheet('Empleados') ?? wb.worksheets[0];
  if (!ws) throw new ArchivoEmpleadosError('El archivo no tiene ninguna hoja.');

  // Una hoja con la dimensión marcada hasta la fila 1,000,000 hace un recorrido enorme aunque esté vacía.
  if (ws.rowCount > MAX_FILAS_HOJA) {
    throw new ArchivoEmpleadosError(`La hoja tiene ${ws.rowCount} filas: una lista de empleados no pasa de ${MAX_FILAS_EMPLEADOS}. Revisa que sea el archivo correcto.`);
  }

  const matriz: unknown[][] = [];
  ws.eachRow({ includeEmpty: true }, (row, numero) => {
    matriz[numero - 1] = (row.values as unknown[]).slice(1);
  });
  return matriz;
}
