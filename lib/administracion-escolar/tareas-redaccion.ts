/**
 * El corrector de las tareas: el equipo de Zero escribe una respuesta y un
 * modelo la corrige, la mejora o la redacta desde la conversación. Nunca envía
 * nada: el texto vuelve a la caja y una persona lo revisa.
 *
 * Qué se le pide está en `tareas-reglas.ts`, donde lo prueba vitest. El modelo y
 * su respaldo se escogen en /admin/ia, con el nombre «Corrector de tareas».
 */
import 'server-only';
import { generateText } from 'ai';
import { registrarConsumo } from '@/lib/ia/consumo-servidor';
import { caminoDe, comoModelo, hayCaminoIa, modelosDe } from '@/lib/ia/modelo-servidor';
import {
  instruccionesRedaccion, limpiarRedaccion, pedidoRedaccion, type ModoRedaccion,
} from './tareas-reglas';

/** Alguien está esperando con la caja abierta. */
const TIEMPO_POR_MODELO_MS = 20_000;

/**
 * El texto nuevo. `null` si no hay forma de llamar a ningún modelo; si hay
 * modelo pero todos fallan, lanza el último error.
 */
export async function redactarEnTarea(d: {
  teamId: number; userId: number; modo: ModoRedaccion; titulo: string; borrador: string;
  mensajes: readonly { tipo: string; autor: string; texto: string }[];
}): Promise<string | null> {
  if (!hayCaminoIa()) return null;

  const { principal, respaldo } = await modelosDe('redaccion');
  let ultimoError: unknown = null;
  for (const id of principal === respaldo ? [principal] : [principal, respaldo]) {
    const modelo = comoModelo(id);
    if (!modelo) continue;
    try {
      const r = await generateText({
        model: modelo,
        instructions: instruccionesRedaccion(d.modo),
        messages: [{ role: 'user', content: pedidoRedaccion(d) }],
        abortSignal: AbortSignal.timeout(TIEMPO_POR_MODELO_MS),
      });
      const uso = r.totalUsage ?? r.usage;
      await registrarConsumo({ teamId: d.teamId, userId: d.userId }, [{
        uso: 'redaccion',
        proveedor: caminoDe(id),
        modelo: id,
        tokensEntrada: uso?.inputTokens ?? 0,
        tokensSalida: uso?.outputTokens ?? 0,
      }]);
      const texto = limpiarRedaccion(r.text);
      if (texto) return texto;
      ultimoError = new Error('El modelo no devolvió un texto que se pueda usar');
    } catch (e) {
      ultimoError = e;
      console.warn(`[tareas-redaccion] ${id} no pudo`, e instanceof Error ? e.message : e);
    }
  }
  if (ultimoError) throw ultimoError;
  return null;
}
