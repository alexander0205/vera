/**
 * Proyección de `clients` para el MCP. Cierra la última de las cinco entidades
 * que seguía haciendo `.select()` pelado — mismo criterio que
 * `campos-facturas.ts`, `campos-pagos.ts`, `campos-recurrentes.ts` y
 * `campos-cargos.ts`: lo que se agregue mañana a la tabla queda fuera por
 * defecto hasta que alguien lo sume aquí.
 *
 * Fuera: `teamId` (siempre el de la key) y `createdBy`/`updatedBy` (ids crudos
 * de usuario: no responden nada que se pueda preguntar y atan la respuesta a
 * la tabla de usuarios).
 *
 * Dentro los datos de contacto —correo, teléfono, celular, whatsapp,
 * dirección—: son de la empresa dueña de la key y son justo lo que hace útil
 * un «mandale el estado de cuenta a este cliente». Vale saber que salen, pero
 * salen a propósito.
 */
import { clients } from '@/lib/db/schema';

export const CAMPOS_CLIENTE = {
  id: clients.id,
  rnc: clients.rnc,
  razonSocial: clients.razonSocial,
  email: clients.email,
  telefono: clients.telefono,
  celular: clients.celular,
  whatsapp: clients.whatsapp,
  direccion: clients.direccion,
  descripcion: clients.descripcion,
  createdAt: clients.createdAt,
  updatedAt: clients.updatedAt,
};
