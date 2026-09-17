/**
 * Llamada mínima a Gemini para leer una imagen y devolver JSON.
 *
 * REST directo (fetch), sin `@ai-sdk/google`: cero dep pesada, sin atarnos a una
 * versión de Node de Vercel, y control propio del timeout y los reintentos. Si
 * el equipo luego quiere unificar con el stack del CRM, se cambia SOLO el
 * interior de este archivo — nadie más sabe que por dentro es REST.
 *
 * Decisiones (aprendidas a golpes en el CRM):
 *  · `maxRetries` = 0 y timeout propio. El SDK reintenta por defecto; con un
 *    `429` de cuota eso tarda ~60s en aparecer como error. Sin reintentos, el
 *    mismo `429` sale en <1s y le decimos al usuario «la IA llegó a su límite».
 *  · `responseMimeType: application/json` + `temperature: 0`: queremos un JSON
 *    estable, no prosa.
 *
 * Env: GOOGLE_GENERATIVE_AI_API_KEY (la key), GEMINI_MODELO (p.ej.
 * gemini-3.6-flash — los nombres viejos dan 404 con keys nuevas).
 */

import 'server-only';

const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models';

export class GeminiError extends Error {
  constructor(message: string, readonly codigo: 'sin-config' | 'limite' | 'timeout' | 'respuesta' | 'http') {
    super(message);
    this.name = 'GeminiError';
  }
}

export function geminiDisponible(): boolean {
  return Boolean(process.env.GOOGLE_GENERATIVE_AI_API_KEY && process.env.GEMINI_MODELO);
}

export interface OpcionesVision {
  /** El texto que guía la extracción. */
  prompt: string;
  /** La imagen ya procesada (JPEG/PNG) en base64, sin el prefijo `data:`. */
  imagenBase64: string;
  mime: string;
  /** Corta la espera. Por defecto 30s. */
  timeoutMs?: number;
}

/**
 * Manda imagen + prompt y devuelve el texto crudo (que pedimos sea JSON). No
 * parsea: eso lo hace quien llama, que conoce la forma esperada.
 */
export async function analizarImagen(opts: OpcionesVision): Promise<string> {
  const key = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  const modelo = process.env.GEMINI_MODELO;
  if (!key || !modelo) throw new GeminiError('Falta GOOGLE_GENERATIVE_AI_API_KEY o GEMINI_MODELO', 'sin-config');

  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 30_000);

  let res: Response;
  try {
    res = await fetch(`${ENDPOINT}/${modelo}:generateContent?key=${key}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: ctrl.signal,
      body: JSON.stringify({
        contents: [{ parts: [
          { text: opts.prompt },
          { inline_data: { mime_type: opts.mime, data: opts.imagenBase64 } },
        ] }],
        generationConfig: { responseMimeType: 'application/json', temperature: 0 },
      }),
    });
  } catch (e) {
    if (e instanceof Error && e.name === 'AbortError') throw new GeminiError('La IA tardó demasiado', 'timeout');
    throw new GeminiError('No se pudo contactar la IA', 'http');
  } finally {
    clearTimeout(t);
  }

  if (res.status === 429) throw new GeminiError('La IA llegó a su límite de uso; intenta más tarde', 'limite');
  if (!res.ok) throw new GeminiError(`La IA respondió ${res.status}`, 'http');

  const json = await res.json().catch(() => null) as
    | { candidates?: { content?: { parts?: { text?: string }[] } }[] } | null;
  const texto = json?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!texto) throw new GeminiError('La IA no devolvió datos legibles', 'respuesta');
  return texto;
}
