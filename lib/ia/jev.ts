/**
 * Jev, de TypeSafe: decisiones estructuradas, no texto.
 *
 * Los otros modelos de lib/ia escriben (contestan al cliente, leen una factura).
 * Jev no escribe ni conversa: recibe un contenido (`state`) y preguntas con
 * tipo, y devuelve para cada una una respuesta que el código usa tal cual:
 *
 *   - `noul`   → sí o no, como probabilidad de sí (0 a 1).
 *   - `choice` → una opción de una lista, con la probabilidad de cada una.
 *   - `score`  → una posición en una escala de niveles que describes tú.
 *
 * Choice y Score traen además `confidence` (0 a 1): qué tan concentrada está la
 * probabilidad. Es lo que decide si el sistema actúa solo, pide que alguien lo
 * revise o lo pasa a una persona (`decidirConConfianza`). El código sigue
 * mandando: Jev solo contesta la pregunta concreta que se le hace.
 *
 * La llave va en `TYPESAFE_API_KEY` (nunca en el código). Sin ella Jev no está
 * disponible y quien lo usa sigue como antes (`jevDisponible`).
 *
 * Docs: https://docs.typesafe.ai/api/system-one
 */

export const MODELO_JEV = 'jev-latest';
const BASE = () => (process.env.TYPESAFE_BASE_URL || 'https://api.typesafe.ai').replace(/\/+$/, '');
/** Jev contesta en ~100 ms; con 8 s de tope una caída suya no detiene a quien lo llama. */
const TOPE_MS = 8000;

export type PreguntaJev =
  | { type: 'noul'; instructions: string; criteria?: { true: string; false: string } | null }
  | { type: 'choice'; instructions: string; criteria: Record<string, string> }
  | { type: 'score'; instructions: string; criteria: string[] };

export type RespuestaJev<P extends PreguntaJev> =
  P extends { type: 'noul' } ? { type: 'noul'; noul: number }
  : P extends { type: 'choice' } ? { type: 'choice'; choice: string; probabilities: Record<string, number>; confidence: number }
  : P extends { type: 'score' } ? { type: 'score'; score: number; probabilities: number[] | Record<string, number>; confidence: number }
  : never;

export interface ResultadoJev<Q extends Record<string, PreguntaJev>> {
  model: string;
  answers: { [K in keyof Q]: RespuestaJev<Q[K]> };
  usage: { input_tokens: number; output_tokens: number };
}

export class ErrorJev extends Error {
  constructor(message: string, readonly status: number | null) { super(message); this.name = 'ErrorJev'; }
}

/** ¿Hay llave para hablar con Jev? Sin ella, quien lo use sigue sin él. */
export const jevDisponible = () => Boolean(process.env.TYPESAFE_API_KEY);

/**
 * Hace las preguntas sobre el contenido, todas en una sola llamada (se evalúan
 * por separado y en paralelo: una no influye en otra). Lanza `ErrorJev` si no
 * hay llave, si TypeSafe contesta con error o si tarda más de `TOPE_MS`.
 */
export async function preguntarAJev<Q extends Record<string, PreguntaJev>>(
  state: string | Record<string, unknown> | unknown[],
  questions: Q,
  opciones: { modelo?: string; fetch?: typeof fetch } = {},
): Promise<ResultadoJev<Q>> {
  const llave = process.env.TYPESAFE_API_KEY;
  if (!llave) throw new ErrorJev('Jev no está configurado (falta TYPESAFE_API_KEY).', null);
  if (Object.keys(questions).length === 0) throw new ErrorJev('No hay preguntas para Jev.', null);

  const controlador = new AbortController();
  const reloj = setTimeout(() => controlador.abort(), TOPE_MS);
  try {
    const r = await (opciones.fetch ?? fetch)(`${BASE()}/v1/systemone`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${llave}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: opciones.modelo ?? MODELO_JEV, state, questions }),
      signal: controlador.signal,
    });
    if (!r.ok) {
      // El cuerpo del error puede traer detalle útil, pero nunca la llave: se recorta y se devuelve.
      const detalle = (await r.text().catch(() => '')).slice(0, 300);
      throw new ErrorJev(`Jev respondió ${r.status}${detalle ? `: ${detalle}` : ''}`, r.status);
    }
    const d = await r.json() as ResultadoJev<Q>;
    for (const k of Object.keys(questions)) {
      if (!d?.answers || !(k in d.answers)) throw new ErrorJev(`Jev no contestó «${k}».`, r.status);
    }
    return d;
  } catch (e) {
    if (e instanceof ErrorJev) throw e;
    if (e instanceof Error && e.name === 'AbortError') throw new ErrorJev(`Jev tardó más de ${TOPE_MS / 1000} s.`, null);
    throw new ErrorJev(`No se pudo hablar con Jev: ${e instanceof Error ? e.message : String(e)}`, null);
  } finally {
    clearTimeout(reloj);
  }
}

export type Camino = 'actuar' | 'revisar' | 'persona';

/**
 * Qué hacer con una respuesta según su confianza, como recomienda TypeSafe:
 * alta → el sistema actúa solo; media → actúa pero alguien lo revisa; baja →
 * lo decide una persona. Los umbrales son del que llama: no es lo mismo
 * sugerir un tema que aprobar un pago.
 */
export function decidirConConfianza(
  confianza: number, umbrales: { actuar: number; revisar: number } = { actuar: 0.8, revisar: 0.5 },
): Camino {
  if (confianza >= umbrales.actuar) return 'actuar';
  if (confianza >= umbrales.revisar) return 'revisar';
  return 'persona';
}

/** Lo mismo para un sí/no: lejos de 0.5 en cualquier dirección es confianza. */
export function caminoDeNoul(noul: number, umbrales?: { actuar: number; revisar: number }): Camino {
  return decidirConConfianza(Math.abs(noul - 0.5) * 2, umbrales);
}
