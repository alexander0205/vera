/**
 * La IA lee el comprobante de la transferencia con la que se paga a un
 * proveedor: monto, impuesto del banco, fecha, referencia.
 *
 * Es el MISMO lector que ya lee los comprobantes de los padres
 * (lib/administracion-escolar/comprobantes-ia.ts) y las facturas de proveedor:
 * el modelo de la parte «captura» de /admin/ia (principal y respaldo), las
 * mismas llaves y el mismo patrón de salida estructurada. No hay una variable
 * nueva ni un modelo nuevo.
 *
 * Reglas que no se aflojan:
 *  1. NUNCA estorba: sin llave, sin red o con una imagen ilegible devuelve `null`
 *     y el pago se registra a mano como siempre.
 *  2. La IA propone, la persona decide. Esto solo devuelve una lectura.
 *  3. Nada de lo que lee se toma por cierto sin pasar por `limpiarLecturaPago`.
 */

import 'server-only';
import { generateText, Output } from 'ai';
import { z } from 'zod';
import { caminoDe, comoModelo, hayCaminoIa, modelosDe } from '@/lib/ia/modelo-servidor';
import { registrarConsumo } from '@/lib/ia/consumo-servidor';
import { limpiarLecturaPago, type LecturaPagoIa } from './comprobante-pago-lectura';

/** Lo que se le pide al modelo. Los montos en pesos, tal como están impresos. */
export const esquemaLecturaPago = z.object({
  esComprobante: z.boolean()
    .describe('true si el archivo es un comprobante, voucher o captura de una transferencia o pago bancario; false si es otra cosa'),
  monto: z.number().nullable()
    .describe('El «monto a transferir» al beneficiario, en pesos dominicanos, como número sin símbolo ni separador de miles (RD$ 4,800.00 es 4800). No incluye el impuesto. null si no se lee o si la moneda no es peso dominicano'),
  impuesto: z.number().nullable()
    .describe('El monto de impuesto o cargo que el banco cobra APARTE de la transferencia (por ejemplo el 0.15 % de las transferencias), en pesos, como número. null si no aparece'),
  fecha: z.string().nullable()
    .describe('La fecha de la operación en formato YYYY-MM-DD. En República Dominicana las fechas van día/mes/año. null si no se lee'),
  referencia: z.string().nullable()
    .describe('El número de referencia de la operación, copiado exacto. null si no hay'),
  idTransaccion: z.string().nullable()
    .describe('El id de la transacción (distinto de la referencia), copiado exacto. null si no hay'),
  bancoOrigen: z.string().nullable().describe('El banco desde el que se envió, si aparece'),
  beneficiario: z.string().nullable().describe('El nombre de quien recibió el dinero, si aparece'),
  confianza: z.number()
    .describe('Entre 0 y 1: qué tan seguro estás de lo que leíste. Baja si la imagen está borrosa, cortada o hay números dudosos'),
});

const INSTRUCCIONES = `Eres asistente contable de una empresa en República Dominicana. Recibes el PDF, la foto o la captura del comprobante de una transferencia bancaria con la que la empresa le pagó a un proveedor, y devuelves lo que el papel dice, tal como está impreso. No interpretes ni supongas.
- El monto es el «monto a transferir» al beneficiario, en pesos dominicanos, como número: RD$ 4,800.00 es 4800. La coma es separador de miles, el punto es el decimal.
- El impuesto es una línea aparte («monto de impuesto», «cargo», «ITBIS», «0.15 %»): va en impuesto y NO se suma al monto.
- La fecha es la de la operación. En RD las fechas van día/mes/año: 03/10/2026 es 2026-10-03.
- Referencia e id de transacción son números distintos: cópialos exactos, con sus letras y ceros.
- Si no es un comprobante de pago bancario, esComprobante=false y todo lo demás null.
- Lo que no se lea con seguridad va null: nunca inventes un número ni un nombre.`;

/** Cuánto se espera a cada modelo; el principal y el respaldo suman, no se pisan. */
const TIEMPO_POR_MODELO_MS = 45_000;

/**
 * Lee el comprobante con el modelo principal de «captura» y, si falla, UNA vez
 * con el respaldo. Devuelve `null` si no hay forma de llamar a ningún modelo. Si
 * hay modelo pero todos fallan, lanza el último error.
 */
export async function leerComprobantePagoConIa(
  archivo: { buffer: Buffer; mime: string },
  teamId: number,
): Promise<LecturaPagoIa | null> {
  if (!hayCaminoIa()) return null;

  const { principal, respaldo } = await modelosDe('captura');
  const candidatos = principal === respaldo ? [principal] : [principal, respaldo];

  let ultimoError: unknown = null;
  for (const id of candidatos) {
    const modelo = comoModelo(id);
    if (!modelo) continue;
    try {
      const r = await generateText({
        model: modelo,
        output: Output.object({ schema: esquemaLecturaPago }),
        instructions: INSTRUCCIONES,
        messages: [{
          role: 'user',
          content: [
            { type: 'text', text: 'Este es el comprobante.' },
            { type: 'file' as const, mediaType: archivo.mime, data: archivo.buffer },
          ],
        }],
        abortSignal: AbortSignal.timeout(TIEMPO_POR_MODELO_MS),
      });

      // Anotar el gasto no es motivo para tirar una lectura buena y reintentar.
      const uso = r.totalUsage ?? r.usage;
      try {
        await registrarConsumo({ teamId }, [{
          uso: 'captura',
          proveedor: caminoDe(id),
          modelo: id,
          tokensEntrada: uso?.inputTokens ?? 0,
          tokensSalida: uso?.outputTokens ?? 0,
        }]);
      } catch (e) {
        console.warn('[comprobante-pago-ia] no se pudo anotar el gasto', e instanceof Error ? e.message : e);
      }

      return limpiarLecturaPago(r.output, id);
    } catch (e) {
      ultimoError = e;
      console.warn(`[comprobante-pago-ia] ${id} no pudo leerlo`, e instanceof Error ? e.message : e);
    }
  }

  if (ultimoError) throw ultimoError;
  return null;
}
