/**
 * Proyección compartida entre `/api/mcp/v1/facturas` (lista) y
 * `/api/mcp/v1/facturas/[id]` (detalle): allowlist de columnas seguras de
 * exponer a una AI externa. Se excluyen XML/PDF/campos internos de DGII a
 * propósito — si mañana se agrega una columna sensible a `ecfDocuments`,
 * queda fuera por defecto hasta que alguien la sume aquí explícitamente.
 */
import { ecfDocuments } from '@/lib/db/schema';

export const CAMPOS_FACTURA = {
  id: ecfDocuments.id,
  encf: ecfDocuments.encf,
  codigo: ecfDocuments.codigo,
  tipoEcf: ecfDocuments.tipoEcf,
  estado: ecfDocuments.estado,
  estadoPago: ecfDocuments.estadoPago,
  clientId: ecfDocuments.clientId,
  rncComprador: ecfDocuments.rncComprador,
  razonSocialComprador: ecfDocuments.razonSocialComprador,
  emailComprador: ecfDocuments.emailComprador,
  montoTotal: ecfDocuments.montoTotal,
  totalItbis: ecfDocuments.totalItbis,
  totalRetenciones: ecfDocuments.totalRetenciones,
  tipoPago: ecfDocuments.tipoPago,
  fechaEmision: ecfDocuments.fechaEmision,
  fechaLimitePago: ecfDocuments.fechaLimitePago,
  dependienteId: ecfDocuments.dependienteId,
  dependienteNombre: ecfDocuments.dependienteNombre,
  origenRecurrenteId: ecfDocuments.origenRecurrenteId,
  periodoRecurrente: ecfDocuments.periodoRecurrente,
  createdAt: ecfDocuments.createdAt,
  updatedAt: ecfDocuments.updatedAt,
};
