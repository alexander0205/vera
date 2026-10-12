/**
 * Proyección de `adminEscolarCargos` para el MCP, mismo criterio que
 * `campos-facturas.ts`, `campos-pagos.ts` y `campos-recurrentes.ts`: allowlist
 * explícita, y lo que se agregue mañana a la tabla queda fuera por defecto.
 *
 * Este es el único de los cuatro que mira HACIA ADELANTE. Los otros cuentan lo
 * que ya se facturó; un cargo con `fechaVencimiento` futura es dinero que
 * todavía no se cobró y que nadie podía consultar.
 *
 * `saldoCentavos` es el campo que importa: `montoCentavos` es lo que se cobró
 * en su momento, `saldoCentavos` es lo que falta. Preguntar «¿cuánto voy a
 * cobrar?» se responde con el saldo, no con el monto.
 *
 * Fuera: `teamId` (siempre el de la key), y `matriculaId`/`periodoId`/`cuotaId`
 * — son llaves internas del armado del plan, no dicen nada a quien pregunta.
 */
import { adminEscolarCargos } from '@/lib/db/schema';

export const CAMPOS_CARGO = {
  id: adminEscolarCargos.id,
  estudianteId: adminEscolarCargos.estudianteId,
  conceptoId: adminEscolarCargos.conceptoId,
  mes: adminEscolarCargos.mes,
  anio: adminEscolarCargos.anio,
  montoCentavos: adminEscolarCargos.montoCentavos,
  saldoCentavos: adminEscolarCargos.saldoCentavos,
  fechaVencimiento: adminEscolarCargos.fechaVencimiento,
  estado: adminEscolarCargos.estado,
  // Si ya tiene factura, el cargo dejó de ser una promesa.
  ecfDocumentId: adminEscolarCargos.ecfDocumentId,
  createdAt: adminEscolarCargos.createdAt,
};
