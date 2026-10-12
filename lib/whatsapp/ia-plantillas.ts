import 'server-only';
import { generateText, Output, type LanguageModel } from 'ai';
import { anthropic } from '@ai-sdk/anthropic';
import { z } from 'zod';
import { casosDeUso } from './plantillas-colegio';

/**
 * El asistente que ayuda al colegio a redactar plantillas que Meta apruebe.
 *
 * Mismos dos caminos que la lectura de facturas (AI Gateway o llave suelta de
 * Anthropic). El modelo se cambia con `PLANTILLAS_IA_MODELO` sin tocar código.
 * No hace falta el más caro: redactar 400 caracteres con reglas claras es
 * trabajo de un modelo rápido.
 */

const MODELO = process.env.PLANTILLAS_IA_MODELO || 'google/gemini-2.5-flash';
const RESPALDO = process.env.PLANTILLAS_IA_MODELO_RESPALDO || 'anthropic/claude-haiku-4-5';

const porGateway = () => Boolean(process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_OIDC_TOKEN);

function comoModelo(id: string): LanguageModel | null {
  if (porGateway()) return id;
  if (process.env.ANTHROPIC_API_KEY && id.startsWith('anthropic/')) return anthropic(id.slice('anthropic/'.length));
  return null;
}

const modelo = () => comoModelo(MODELO) ?? comoModelo(RESPALDO);
export const iaPlantillasDisponible = () => modelo() !== null;

export const esquemaRespuesta = z.object({
  respuesta: z.string()
    .describe('Lo que le dices al colegio: breve, en español, sin jerga de Meta. Si propones una plantilla, di en una o dos frases por qué.'),
  propuesta: z.object({
    nombre: z.string().describe('Nombre corto en español, p. ej. «Recordatorio de mensualidad»'),
    categoria: z.enum(['utility', 'marketing']),
    cuerpo: z.string().describe('El mensaje con {{1}}, {{2}}… en el orden pedido'),
    pie: z.string().nullable(),
    variables: z.array(z.object({
      pos: z.number().int(),
      nombre: z.string(),
      tipo: z.enum(['texto', 'monto', 'fecha']),
      ejemplo: z.string().describe('Un valor de ejemplo realista, nunca vacío'),
    })),
    avisoSugerido: z.string().nullable()
      .describe('La clave del caso de uso al que encaja, si encaja en uno'),
  }).nullable().describe('null si solo estás conversando o preguntando algo'),
});
export type RespuestaIa = z.infer<typeof esquemaRespuesta>;

function instrucciones(): string {
  const casos = casosDeUso().map((c) =>
    `- ${c.clave} («${c.titulo}»): ${c.detalle}\n  Variables en ESTE orden: ${c.variables.map((v) => `{{${v.pos}}} ${v.nombre}`).join(', ')}`).join('\n');

  return `Ayudas al administrador de un colegio dominicano a escribir plantillas de WhatsApp Business para avisar a las familias (cobros, recordatorios). Hablas en español dominicano neutro, claro y breve.

Cuando el colegio describa lo que quiere, propón UNA plantilla lista para enviar a aprobación. Reglas de Meta que debes cumplir siempre:
- Variables como {{1}}, {{2}}… consecutivas desde 1. NUNCA al inicio ni al final del mensaje, y nunca dos pegadas.
- Cada variable lleva texto alrededor; no más variables que frases. Máximo 1024 caracteres.
- Sin saltos de línea dentro de una variable, sin mayúsculas gritadas, sin signos de exclamación repetidos, sin enlaces acortados.
- categoria "utility" para avisos de una cuenta o cobro que la familia ya tiene (casi siempre). "marketing" solo si es promoción, inscripciones abiertas, ofertas; es más cara y más estricta.
- Para cobros: tono respetuoso, nunca amenazante ni humillante; di cuánto, de qué y hasta cuándo.
- El pie es opcional y corto (máx. 60), sin variables.

Casos de uso del sistema. Si lo que pide el colegio encaja en uno, usa EXACTAMENTE sus variables en ESE orden (el sistema rellena por posición) y pon su clave en avisoSugerido. Si no encaja en ninguno, avisoSugerido es null y eres libre con las variables.
${casos}

Si el colegio ya tiene un borrador, parte de él y devuélvelo mejorado. Si pide algo que Meta rechazaría (amenazas, presión, datos sensibles), dilo y ofrece la alternativa. Si falta información clave, pregunta UNA cosa y deja propuesta en null.`;
}

export interface MensajeChat { role: 'user' | 'assistant'; content: string }

export async function conversarPlantilla(
  historial: MensajeChat[],
  borrador: { nombre?: string; cuerpo?: string; avisoDestino?: string | null } | null,
  colegio: string | null,
): Promise<RespuestaIa> {
  const principal = modelo();
  if (!principal) throw new Error('El asistente de IA no está configurado');

  const contexto = [
    colegio ? `El colegio se llama «${colegio}».` : '',
    borrador?.avisoDestino ? `El usuario quiere esta plantilla para el caso de uso «${borrador.avisoDestino}».` : '',
    borrador?.cuerpo?.trim() ? `Borrador actual en el editor:\n${borrador.cuerpo.trim()}` : '',
  ].filter(Boolean).join('\n');

  const correr = async (m: LanguageModel) => {
    const { output } = await generateText({
      model: m,
      output: Output.object({ schema: esquemaRespuesta }),
      instructions: instrucciones() + (contexto ? `\n\nContexto de esta conversación:\n${contexto}` : ''),
      messages: historial.map((h) => ({ role: h.role, content: h.content })),
      abortSignal: AbortSignal.timeout(60_000),
    });
    return output;
  };

  try {
    return await correr(principal);
  } catch (e) {
    const otro = comoModelo(RESPALDO);
    if (!otro || otro === principal) throw e;
    console.warn(`[plantillas-ia] ${MODELO} falló; se reintenta con ${RESPALDO}`, e);
    return correr(otro);
  }
}
