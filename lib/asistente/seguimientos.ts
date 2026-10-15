/**
 * Preguntas que se ofrecen como botones después de una respuesta. Cada una es
 * algo que el contestador local ya sabe responder usando la pregunta anterior
 * (la prueba lo comprueba), así que un clic nunca termina en «no entendí».
 */

const POR_INTENCION: Record<string, string[]> = {
  ventas: ['¿Y por cliente?', '¿Y por método de pago?', 'Compara con el mes pasado'],
  'seguimiento:ventas': ['¿Y por cliente?', 'Ventas por mes'],
  tendencia: ['¿Y por cliente?', 'Compara con el mes pasado', 'Pásalo a Excel'],
  'mejores-clientes': ['¿Y por producto?', 'Pásalo a Excel', 'Pásalo a PDF'],
  'mas-vendidos': ['¿Y por cliente?', 'Pásalo a Excel', 'Pásalo a PDF'],
  'cobros-metodo': ['¿Y por cliente?', 'Compara con el mes pasado'],
  cobrado: ['¿Y por método de pago?', 'Compara con el mes pasado'],
  gastos: ['Compara con el mes pasado', 'Resumen de ITBIS del mes'],
  itbis: ['Compara con el mes pasado', '¿Cuánto gasté este mes?'],
  cartera: ['Clientes morosos', 'Pásalo a Excel', 'Pásalo a PDF'],
  comparativo: ['Pásalo a PDF', '¿Y por cliente?'],
  'resumen-dia': ['Resumen de la semana', '¿Quién me debe y cuánto?'],
  'resumen-semana': ['Pásalo a Excel', 'Pásalo a PDF'],
  'ultima-factura': ['¿Hay facturas por revisar?', '¿Cuántos borradores tengo?'],
  borradores: ['Mis últimas facturas', '¿Quién me debe y cuánto?'],
  'por-revisar': ['Resumen de hoy'],
  'estado-dgii': ['¿Qué me falta para emitir mi primera factura?'],
  'guia-paso': [],
};

export function seguimientosDe(intencion: string | undefined | null): string[] {
  if (!intencion) return [];
  return POR_INTENCION[intencion] ?? POR_INTENCION[intencion.replace(/^seguimiento:/, '')] ?? [];
}

export const TODOS_LOS_SEGUIMIENTOS = Object.entries(POR_INTENCION);
