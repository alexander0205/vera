import 'server-only';
import { jevDisponible, preguntarAJev, MODELO_JEV } from '@/lib/ia/jev';
import type { Consumo } from '@/lib/ia/consumo';

/**
 * Las decisiones del asistente que toma Jev (TypeSafe): preguntas de sí o no
 * sobre el turno, no texto para la persona. Cada una es barata (~100 ms y
 * centavos por millón de tokens) y, si Jev no está o falla, el asistente sigue
 * como antes: Jev nunca es lo único que hay.
 */

/** En el chat hay una persona esperando: Jev o contesta rápido o no se espera. */
const TOPE_CHAT_MS = 2_500;

/** Por debajo de esto, la respuesta automática no contesta lo que se preguntó y va la IA. */
export const UMBRAL_CONTESTA = 0.4;

/**
 * ¿La respuesta del contestador automático contesta la pregunta? El
 * contestador elige por palabras clave y a veces acierta el tema pero no el
 * dato («¿cuántos estudiantes tienen deuda vencida?» contestado con el total
 * de matriculados). Si Jev dice que no, la pregunta pasa a la IA.
 *
 * Devuelve `null` cuando no hay veredicto (sin llave, error o tardanza): quien
 * llama sigue con la respuesta automática, como antes de Jev.
 */
export async function respuestaContesta(
  pregunta: string,
  respuesta: string,
  consumos: Consumo[],
  opciones: { fetch?: typeof fetch } = {},
): Promise<boolean | null> {
  if (!jevDisponible() || !pregunta.trim() || !respuesta.trim()) return null;
  try {
    const r = await preguntarAJev(
      // Solo la pregunta y la respuesta: nada de la sesión ni de la empresa.
      { pregunta: pregunta.slice(0, 600), respuesta: respuesta.slice(0, 2_000) },
      {
        contesta: {
          type: 'noul',
          instructions:
            'La respuesta, ¿contesta lo que la persona preguntó: el mismo dato, del mismo grupo y del mismo período? ' +
            'Una respuesta sobre otro dato (por ejemplo, el total de estudiantes cuando se preguntó cuántos deben) no lo contesta.',
          criteria: {
            true: 'Contesta exactamente lo que se preguntó.',
            false: 'Habla de otro dato, de otro grupo, de otro período o de otra cosa.',
          },
        },
      },
      { fetch: opciones.fetch, topeMs: TOPE_CHAT_MS },
    );
    consumos.push({
      uso: 'decisiones', proveedor: 'typesafe', modelo: r.model || MODELO_JEV,
      tokensEntrada: r.usage?.input_tokens ?? 0, tokensSalida: r.usage?.output_tokens ?? 0,
    });
    return r.answers.contesta.noul >= UMBRAL_CONTESTA;
  } catch (e) {
    console.warn('[asistente] Jev no pudo revisar la respuesta automática:', e instanceof Error ? e.message : e);
    return null;
  }
}

export type NivelPregunta = 'normal' | 'analisis';

/**
 * Lo que delata una pregunta de análisis cuando Jev no está o no está seguro:
 * pide causas, comparar, proyectar o qué hacer. Sin tildes y en minúsculas.
 */
const PALABRAS_ANALISIS = /\b(por ?que|analiza\w*|analisis|compar\w*|explica\w*|recomien\w*|que (deberia|debo|me conviene|hago|harias)|proyecc\w*|proyect\w*|tendencia|causa\w*|motivo\w*|estrategia\w*|como (mejoro|puedo mejorar|reduzco|aumento|subo|bajo)|rentab\w*|evalua\w*|diagnostic\w*)\b/;

export function nivelPorPalabras(pregunta: string): NivelPregunta {
  const t = pregunta.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  return PALABRAS_ANALISIS.test(t) ? 'analisis' : 'normal';
}

/** Por debajo de esta confianza, Jev no decide: deciden las palabras. */
export const CONFIANZA_NIVEL = 0.6;

/**
 * ¿La pregunta pide análisis (razonar sobre varios datos: porqués,
 * comparaciones, recomendaciones) o es normal (buscar, listar, resumir)? De eso
 * depende el modelo: las normales van al modelo gratis y las de análisis a
 * Claude (ver `usosIa` en lib/ia/modelos.ts).
 *
 * Decide Jev; sin Jev, o si no está seguro, las palabras de la pregunta. Nunca
 * lanza: una pregunta siempre tiene nivel.
 */
export async function nivelDePregunta(
  pregunta: string,
  consumos: Consumo[],
  opciones: { fetch?: typeof fetch; previa?: string } = {},
): Promise<{ nivel: NivelPregunta; por: 'jev' | 'palabras' }> {
  const porPalabras = { nivel: nivelPorPalabras(pregunta), por: 'palabras' as const };
  if (!jevDisponible() || !pregunta.trim()) return porPalabras;
  try {
    const r = await preguntarAJev(
      {
        pregunta: pregunta.slice(0, 600),
        // «¿y el mes pasado?» solo se entiende con lo anterior.
        ...(opciones.previa ? { preguntaAnterior: opciones.previa.slice(0, 300) } : {}),
      },
      {
        nivel: {
          type: 'choice',
          instructions: '¿Qué pide la persona al asistente de su sistema de facturación y administración?',
          criteria: {
            normal: 'Un dato, una lista, un resumen o dónde se hace algo: cuánto vendí, quién me debe, cuántos alumnos hay, cómo creo una factura.',
            analisis: 'Razonar sobre varios datos: explicar por qué pasó algo, comparar períodos, proyectar o recomendar qué hacer.',
          },
        },
      },
      { fetch: opciones.fetch, topeMs: TOPE_CHAT_MS },
    );
    consumos.push({
      uso: 'decisiones', proveedor: 'typesafe', modelo: r.model || MODELO_JEV,
      tokensEntrada: r.usage?.input_tokens ?? 0, tokensSalida: r.usage?.output_tokens ?? 0,
    });
    const a = r.answers.nivel;
    if (a.confidence < CONFIANZA_NIVEL || (a.choice !== 'normal' && a.choice !== 'analisis')) return porPalabras;
    return { nivel: a.choice, por: 'jev' };
  } catch (e) {
    console.warn('[asistente] Jev no pudo clasificar la pregunta:', e instanceof Error ? e.message : e);
    return porPalabras;
  }
}
