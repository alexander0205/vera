/**
 * La IA lee el comprobante que sube la familia: banco, monto, fecha, referencia.
 *
 * Es el MISMO lector que ya lee las facturas de proveedor (lib/compras/captura/ia.ts),
 * con los mismos modelos, las mismas llaves y el mismo patrón de salida
 * estructurada: el modelo de la parte «captura» de /admin/ia (principal y
 * respaldo) y, para llamarlo, `comoModelo` de lib/ia/modelo-servidor.ts —
 * AI Gateway (AI_GATEWAY_API_KEY, o el token OIDC en Vercel) o la llave directa
 * del proveedor (GOOGLE_GENERATIVE_AI_API_KEY, ANTHROPIC_API_KEY). No hay una
 * variable nueva ni un modelo nuevo.
 *
 * Reglas que no se aflojan:
 *
 *  1. NUNCA estorba al padre. Corre en `after()`, con la respuesta ya enviada, y
 *     no lanza: sin llave, sin red o con una imagen ilegible el comprobante
 *     queda como siempre, sin lectura, para revisarlo mirando el papel.
 *  2. La IA propone, la persona decide. Esto solo escribe `lectura_ia`; no
 *     aprueba, no rechaza y no toca ningún cobro.
 *  3. Nada de lo que lee se toma por cierto sin pasar por `limpiarLectura`.
 */

import 'server-only';
import { createHash } from 'crypto';
import { generateText, Output } from 'ai';
import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { adminEscolarComprobantes } from '@/lib/db/schema';
import { caminoDe, comoModelo, hayCaminoIa, modelosDe } from '@/lib/ia/modelo-servidor';
import { registrarConsumo } from '@/lib/ia/consumo-servidor';
import { limpiarLectura, type LecturaComprobanteIa } from './comprobante-lectura';

/** sha256 del archivo, en hexadecimal: la huella con la que se detecta la misma foto subida dos veces. */
export function hashArchivo(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex');
}

/** Lo que se le pide al modelo. El monto en pesos, tal como está impreso. */
export const esquemaLecturaComprobante = z.object({
  esComprobante: z.boolean()
    .describe('true si la imagen es un comprobante, voucher o captura de una transferencia, depósito o pago bancario; false si es otra cosa (una foto cualquiera, una conversación, una factura)'),
  bancoDestino: z.string().nullable()
    .describe('El banco de la cuenta que RECIBE el dinero (beneficiario, «cuenta destino», «a favor de»). Tal como se lee: Popular, BHD, Banreservas, Scotiabank… null si el papel no lo dice'),
  bancoOrigen: z.string().nullable()
    .describe('El banco de quien ENVÍA el dinero (ordenante, «cuenta origen»), o el de la app desde la que se hizo la transferencia. null si no se ve'),
  cuentaDestino: z.string().nullable()
    .describe('El número de la cuenta destino tal como aparece, aunque esté enmascarado («****4821»). null si no se ve'),
  monto: z.number().nullable()
    .describe('El importe transferido, en pesos dominicanos, como número sin símbolo ni separador de miles (RD$ 4,800.00 es 4800). No la comisión ni un total distinto. null si no se lee o si la moneda no es peso dominicano'),
  fecha: z.string().nullable()
    .describe('La fecha de la operación en formato YYYY-MM-DD. En República Dominicana las fechas van día/mes/año. null si no se lee'),
  referencia: z.string().nullable()
    .describe('El número de confirmación, autorización, referencia o transacción de la operación, copiado exacto. null si no hay'),
  ordenante: z.string().nullable().describe('El nombre de quien envió el dinero, si aparece'),
  beneficiario: z.string().nullable().describe('El nombre de quien lo recibió, si aparece'),
  confianza: z.number()
    .describe('Entre 0 y 1: qué tan seguro estás de lo que leíste. Baja si la imagen está borrosa, cortada o hay números dudosos'),
});

const INSTRUCCIONES = `Eres asistente de un colegio en República Dominicana. Recibes la foto, la captura de pantalla o el PDF de un comprobante de transferencia o depósito bancario que subió una familia, y devuelves lo que el papel dice, tal como está impreso. No interpretes ni supongas.
- El banco que interesa es el de la cuenta que RECIBE el dinero (el del colegio): el beneficiario, la «cuenta destino». Si la imagen solo deja ver el banco desde el que se envió —el logo de la app, la «cuenta origen»—, ese es bancoOrigen y bancoDestino queda null. No los confundas.
- El monto es lo transferido, en pesos dominicanos, como número: RD$ 4,800.00 es 4800. La coma es separador de miles, el punto es el decimal. Si hay comisión o ITBIS aparte, el monto es la transferencia, no el total con cargos. Si la moneda es dólares u otra, monto null.
- La fecha es la de la operación. En RD las fechas van día/mes/año: 03/10/2026 es 2026-10-03.
- La referencia es el número de confirmación, autorización o transacción. Cópialo exacto, con sus letras y ceros.
- Si no es un comprobante de pago bancario, esComprobante=false y todo lo demás null.
- Lo que no se lea con seguridad va null: nunca inventes un número ni un nombre.`;

/** Cuánto se espera a cada modelo; el principal y el respaldo suman, no se pisan. */
const TIEMPO_POR_MODELO_MS = 45_000;

/**
 * Lee el comprobante con el modelo principal de «captura» y, si falla, UNA vez
 * con el respaldo — igual que la factura de proveedor.
 *
 * Devuelve `null` si no hay forma de llamar a ningún modelo (sin AI Gateway ni
 * llave de proveedor). Si hay modelo pero todos fallan, lanza el último error.
 */
export async function leerComprobanteConIa(
  archivo: { buffer: Buffer; mime: string },
  teamId: number,
): Promise<LecturaComprobanteIa | null> {
  if (!hayCaminoIa()) return null;

  const { principal, respaldo } = await modelosDe('captura');
  const candidatos = principal === respaldo ? [principal] : [principal, respaldo];

  let ultimoError: unknown = null;
  for (const id of candidatos) {
    // Sin camino para ESTE modelo (p. ej. uno de Google con solo la llave de
    // Anthropic): se pasa al siguiente en vez de darlo por fallado.
    const modelo = comoModelo(id);
    if (!modelo) continue;

    try {
      const r = await generateText({
        model: modelo,
        output: Output.object({ schema: esquemaLecturaComprobante }),
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

      // El gasto se anota con la parte «captura»: es la misma bolsa de modelos.
      // Aparte del try de arriba: que no se pueda anotar el gasto no es motivo
      // para tirar una lectura buena y reintentar con otro modelo (y cobrarla dos veces).
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
        console.warn('[comprobante-ia] no se pudo anotar el gasto', e instanceof Error ? e.message : e);
      }

      return limpiarLectura(r.output, id);
    } catch (e) {
      ultimoError = e;
      console.warn(`[comprobante-ia] ${id} no pudo leerlo`, e instanceof Error ? e.message : e);
    }
  }

  if (ultimoError) throw ultimoError;
  return null;
}

/**
 * Lee un comprobante recién subido y guarda la lectura en su fila. Para
 * `after()`: nunca lanza, y si no hay nada que guardar no escribe nada.
 */
export async function leerYGuardarComprobante(
  datos: { teamId: number; id: number; buffer: Buffer; mime: string },
): Promise<void> {
  try {
    const lectura = await leerComprobanteConIa({ buffer: datos.buffer, mime: datos.mime }, datos.teamId);
    if (!lectura) return;

    await db.update(adminEscolarComprobantes)
      .set({ lecturaIa: lectura, lecturaIaEn: new Date() })
      .where(and(
        eq(adminEscolarComprobantes.id, datos.id),
        eq(adminEscolarComprobantes.teamId, datos.teamId),
      ));
  } catch (e) {
    console.error('[comprobante-ia] no se pudo leer el comprobante', datos.id, e instanceof Error ? e.message : e);
  }
}
