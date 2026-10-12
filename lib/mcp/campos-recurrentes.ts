/**
 * Proyección de `facturasRecurrentes` para el MCP, mismo criterio que
 * `campos-facturas.ts` y `campos-pagos.ts`.
 *
 * Antes estas dos rutas hacían `.select()` pelado: salía la tabla entera. No
 * filtraba nada sensible hoy, pero el día que alguien agregue una columna a
 * `facturasRecurrentes` — un token, una nota interna, lo que sea — se la
 * estaría entregando a una AI externa sin que nadie lo decidiera. Con la
 * allowlist, una columna nueva queda fuera por defecto hasta que se sume aquí.
 *
 * `teamId` va fuera: siempre es el de la key, no aporta y solo invita a
 * pensar que se puede pedir otro.
 */
import { facturasRecurrentes } from '@/lib/db/schema';

export const CAMPOS_RECURRENTE = {
  id: facturasRecurrentes.id,
  clientId: facturasRecurrentes.clientId,
  nombre: facturasRecurrentes.nombre,
  descripcion: facturasRecurrentes.descripcion,
  tipoEcf: facturasRecurrentes.tipoEcf,
  tipoPago: facturasRecurrentes.tipoPago,
  diasParaPago: facturasRecurrentes.diasParaPago,
  frecuencia: facturasRecurrentes.frecuencia,
  diaCobro: facturasRecurrentes.diaCobro,
  fechaInicio: facturasRecurrentes.fechaInicio,
  fechaFin: facturasRecurrentes.fechaFin,
  proximaEmision: facturasRecurrentes.proximaEmision,
  estado: facturasRecurrentes.estado,
  totalEstimado: facturasRecurrentes.totalEstimado,
  facturasEmitidas: facturasRecurrentes.facturasEmitidas,
  createdAt: facturasRecurrentes.createdAt,
  updatedAt: facturasRecurrentes.updatedAt,
};

/**
 * El detalle suma las dos columnas grandes o de texto libre: `items` (las
 * líneas del plan en JSON) y `notas` (lo que escribió una persona). En la
 * lista no van a propósito — con `limit=500` son quinientos blobs por una
 * pregunta que casi siempre es «¿qué planes tengo?», no «¿qué factura cada
 * uno?».
 */
export const CAMPOS_RECURRENTE_DETALLE = {
  ...CAMPOS_RECURRENTE,
  items: facturasRecurrentes.items,
  notas: facturasRecurrentes.notas,
};
