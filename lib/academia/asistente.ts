/**
 * El asistente de la Academia: contesta «cómo cobro una cuenta» con lo que
 * dicen los videos y señala el minuto exacto.
 *
 * Usa la IA que Zero ya tiene (el modelo y el respaldo se escogen en /admin/ia, uso
 * «Academia: asistente de videos», aparte del chat, con un modelo barato por defecto); no agrega
 * otro proveedor. Sin modelo disponible, o si todos fallan, contesta con lo
 * mejor que encontró el buscador. Lo que escribe el modelo pasa por
 * `procesarRespuesta`, que solo deja enlazar a videos publicados.
 */
import 'server-only';
import { generateText } from 'ai';
import { registrarConsumo } from '@/lib/ia/consumo-servidor';
import { caminoDe, comoModelo, hayCaminoIa, modelosDe } from '@/lib/ia/modelo-servidor';
import type { Resultado, VideoBuscable } from './busqueda';
import {
  MAX_TOKENS_SALIDA, armarContexto, instruccionesAsistente, opcionesSinRazonamiento, pedidoAsistente, procesarRespuesta, respuestaSinIa,
  type RespuestaAcademia,
} from './respuesta';

const TIEMPO_POR_MODELO_MS = 20_000;

type VideoConDuracion = VideoBuscable & { duracionSeg: number };

export async function responderPregunta(d: {
  pregunta: string;
  candidatos: readonly Resultado<VideoConDuracion>[];
  todos: readonly VideoConDuracion[];
  userId: number;
  teamId: number | null;
}): Promise<RespuestaAcademia> {
  // Sin nada que citar, el modelo solo inventaría: no se le llama.
  if (d.candidatos.length === 0 || !hayCaminoIa()) return respuestaSinIa(d.candidatos);

  const contexto = armarContexto(d.candidatos, d.pregunta);
  const { principal, respaldo } = await modelosDe('academia');
  for (const id of principal === respaldo ? [principal] : [principal, respaldo]) {
    const modelo = comoModelo(id);
    if (!modelo) continue;
    try {
      const r = await generateText({
        model: modelo,
        instructions: instruccionesAsistente(),
        messages: [{ role: 'user', content: pedidoAsistente(d.pregunta, contexto) }],
        maxOutputTokens: MAX_TOKENS_SALIDA,
        providerOptions: opcionesSinRazonamiento(id),
        abortSignal: AbortSignal.timeout(TIEMPO_POR_MODELO_MS),
      });
      const uso = r.totalUsage ?? r.usage;
      await registrarConsumo({ teamId: d.teamId, userId: d.userId }, [{
        uso: 'academia',
        proveedor: caminoDe(id),
        modelo: id,
        tokensEntrada: uso?.inputTokens ?? 0,
        tokensSalida: uso?.outputTokens ?? 0,
      }]);
      const respuesta = procesarRespuesta(r.text, d.todos);
      if (respuesta.partes.length > 0) {
        // Si el modelo no señaló ningún momento, se agrega el mejor que halló el buscador.
        if (respuesta.videos.length === 0) return { ...respuestaSinIa(d.candidatos), partes: [...respuesta.partes, ...respuestaSinIa(d.candidatos).partes.slice(1)] };
        return respuesta;
      }
    } catch (e) {
      console.warn(`[academia] ${id} no pudo contestar`, e instanceof Error ? e.message : e);
    }
  }
  return respuestaSinIa(d.candidatos);
}
