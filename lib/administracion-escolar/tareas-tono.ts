/**
 * La revisión del tono: antes de que el equipo de Zero envíe una respuesta a un
 * colegio, un modelo barato lee el borrador y avisa si puede dañar al cliente.
 * SOLO el equipo de Zero pasa por aquí.
 *
 * NUNCA BLOQUEA. Hay 3 segundos en total (TIEMPO_TONO_MS); si no hay llave, el
 * modelo falla, tarda o contesta algo que no sirve, el resultado es «sin
 * riesgo» y el mensaje se envía normal. Nunca lanza.
 *
 * Se manda SOLO el borrador. El modelo se escoge en /admin/ia («Tareas: revisión
 * del tono»; de fábrica Gemini Flash-Lite, gratis con la llave de Google AI
 * Studio, directo y sin gateway). Sin esa llave y sin otro camino, no se llama.
 */
import 'server-only';
import { generateText, Output } from 'ai';
import { registrarConsumo } from '@/lib/ia/consumo-servidor';
import { caminoDe, comoModelo, modelosDe } from '@/lib/ia/modelo-servidor';
import {
  esquemaTono, instruccionesTono, limpiarTono, pedidoTono, SIN_RIESGO, TIEMPO_TONO_MS, type RevisionTono,
} from './tareas-tono-reglas';

export async function revisarTono(d: { teamId: number; userId: number; borrador: string }): Promise<RevisionTono> {
  if (!d.borrador.trim()) return SIN_RIESGO;
  // Tope duro por encima de todo (leer los ajustes, el modelo y anotar el gasto): nunca se espera de más.
  let reloj: ReturnType<typeof setTimeout> | undefined;
  const tarde = new Promise<RevisionTono>((resolver) => { reloj = setTimeout(() => resolver(SIN_RIESGO), TIEMPO_TONO_MS + 500); });
  try {
    return await Promise.race([consultar(d), tarde]);
  } finally { clearTimeout(reloj); }
}

async function consultar(d: { teamId: number; userId: number; borrador: string }): Promise<RevisionTono> {
  const borrador = d.borrador.trim();
  try {
    const { principal } = await modelosDe('revision_tono');
    const modelo = comoModelo(principal);
    // Sin llave del proveedor ni gateway: no hay a quién preguntar.
    if (!modelo) return SIN_RIESGO;
    const r = await generateText({
      model: modelo,
      output: Output.object({ schema: esquemaTono }),
      instructions: instruccionesTono(),
      messages: [{ role: 'user', content: pedidoTono(borrador) }],
      maxRetries: 0,
      abortSignal: AbortSignal.timeout(TIEMPO_TONO_MS),
    });
    const uso = r.totalUsage ?? r.usage;
    await registrarConsumo({ teamId: d.teamId, userId: d.userId }, [{
      uso: 'revision_tono',
      proveedor: caminoDe(principal),
      modelo: principal,
      tokensEntrada: uso?.inputTokens ?? 0,
      tokensSalida: uso?.outputTokens ?? 0,
    }]);
    return limpiarTono(r.output);
  } catch (e) {
    console.warn('[tareas-tono] no se pudo revisar; se envía normal:', e instanceof Error ? e.message : e);
    return SIN_RIESGO;
  }
}
