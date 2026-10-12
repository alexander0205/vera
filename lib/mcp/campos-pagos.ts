/**
 * Proyección compartida entre `/api/mcp/v1/pagos` (lista) y
 * `/api/mcp/v1/pagos/[id]` (detalle): allowlist de columnas seguras de exponer
 * a una AI externa. Mismo criterio que `campos-facturas.ts` — si mañana se
 * agrega una columna sensible a `pagosRecibidos`, queda fuera por defecto
 * hasta que alguien la sume aquí explícitamente.
 *
 * Fuera a propósito:
 *   - `createdBy`: es un id de usuario. Se expone el NOMBRE vía join, que es
 *     lo que sirve para responder «¿quién lo registró?»; el id no le dice
 *     nada a quien pregunta y ata la respuesta a la tabla de usuarios.
 *   - `turnoCajaId`: plomería interna del cuadre de caja.
 *
 * Dentro a propósito, aunque parezca de más:
 *   - `notaCreditoId`: un pago con NC NO es dinero que entró. Sin este campo
 *     la AI sumaría notas de crédito como efectivo cobrado y contestaría de
 *     más al «¿cuánto entró hoy?». Va también `metodo`, que dice lo mismo por
 *     otro lado ('nota_credito'), pero tener el id permite rastrear cuál.
 */
import { pagosRecibidos } from '@/lib/db/schema';

export const CAMPOS_PAGO = {
  id: pagosRecibidos.id,
  ecfDocumentId: pagosRecibidos.ecfDocumentId,
  montoCentavos: pagosRecibidos.montoCentavos,
  metodo: pagosRecibidos.metodo,
  notaCreditoId: pagosRecibidos.notaCreditoId,
  referencia: pagosRecibidos.referencia,
  cuenta: pagosRecibidos.cuenta,
  fechaPago: pagosRecibidos.fechaPago,
  notas: pagosRecibidos.notas,
  createdAt: pagosRecibidos.createdAt,
};
