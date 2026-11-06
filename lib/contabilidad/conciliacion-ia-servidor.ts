import 'server-only';
import { generateText, Output } from 'ai';
import { caminoDe, comoModelo, hayCaminoIa, modelosDe } from '@/lib/ia/modelo-servidor';
import { registrarConsumo } from '@/lib/ia/consumo-servidor';
import { rateLimitDb } from '@/lib/rate-limit';
import {
  conciliacionIaActiva, permitirUsoIa, LecturaIaError, MAX_PAGINAS_PDF,
  type LlamadaModelo, type PermisoIa, type TipoUsoIa,
} from './extracto-ia';

/**
 * El lado servidor de la IA de conciliación: la llamada real al modelo (la parte
 * «conciliacion» de /admin/ia, con su respaldo), el gasto anotado por empresa,
 * el tope por hora y la lectura del texto de un PDF. Lo demás es puro y vive en
 * `extracto-ia.ts` / `conciliacion-ayuda-reglas.ts`.
 */

/** Cuánto se espera a cada modelo; el principal y el respaldo suman, no se pisan. */
const TIEMPO_POR_MODELO_MS = 60_000;

/** ¿Hay interruptor encendido Y por dónde llamar a un modelo? Es lo que decide si la pantalla enseña el botón. */
export const iaConciliacionDisponible = () => conciliacionIaActiva() && hayCaminoIa();

export const permitirIa = (tipo: TipoUsoIa, teamId: number): Promise<PermisoIa> =>
  permitirUsoIa(tipo, teamId, (k, max, ms) => rateLimitDb(k, max, ms));

/** La llamada real. Principal y, si falla, UNA vez el respaldo. Anota el gasto de la empresa. */
export function crearLlamadaModelo(ctx: { teamId: number; userId: number }): LlamadaModelo {
  return async (p) => {
    if (!hayCaminoIa()) throw new LecturaIaError('La IA no está disponible en este momento.', 503);
    const { principal, respaldo } = await modelosDe('conciliacion');
    const candidatos = principal === respaldo ? [principal] : [principal, respaldo];

    let ultimo: unknown = null;
    for (const id of candidatos) {
      const modelo = comoModelo(id);
      if (!modelo) continue;
      try {
        const contenido: ({ type: 'text'; text: string } | { type: 'file'; mediaType: string; data: Buffer })[] = [];
        if (p.texto) contenido.push({ type: 'text', text: p.texto });
        if (p.archivo) contenido.push({ type: 'file', mediaType: p.archivo.mime, data: p.archivo.buffer });
        const r = await generateText({
          model: modelo,
          output: Output.object({ schema: p.esquema }),
          instructions: p.instrucciones,
          messages: [{ role: 'user', content: contenido }],
          maxOutputTokens: p.maxTokensSalida,
          maxRetries: 0,
          abortSignal: AbortSignal.timeout(TIEMPO_POR_MODELO_MS),
        });
        const uso = r.totalUsage ?? r.usage;
        // Anotar el gasto no es motivo para tirar una lectura buena.
        await registrarConsumo({ teamId: ctx.teamId, userId: ctx.userId }, [{
          uso: 'conciliacion', proveedor: caminoDe(id), modelo: id,
          tokensEntrada: uso?.inputTokens ?? 0, tokensSalida: uso?.outputTokens ?? 0,
        }]);
        return { salida: r.output as unknown, modelo: id };
      } catch (e) {
        ultimo = e;
        console.warn(`[conciliacion-ia] ${id} no pudo`, e instanceof Error ? e.message : e);
      }
    }
    if (ultimo) throw new LecturaIaError('La IA no pudo leer esto ahora mismo. Intenta de nuevo, o sube el archivo en CSV o Excel.', 502);
    throw new LecturaIaError('La IA no está disponible en este momento.', 503);
  };
}

/**
 * El texto de un PDF. `pdf-parse/worker` va ANTES que `pdf-parse` y todo dentro
 * del try: sin eso pdf.js revienta en Vercel («DOMMatrix is not defined») y, si
 * la librería no carga, el PDF se manda al modelo como archivo en vez de tumbar
 * la ruta. Solo se leen las primeras páginas (tope + 1, para poder avisar que
 * se pasó).
 */
export async function extraerTextoPdf(buffer: Buffer): Promise<{ texto: string; paginas: number } | null> {
  let parser: { getText: (p?: { first?: number }) => Promise<{ text: string; total: number }>; destroy: () => Promise<void> } | null = null;
  try {
    await import('pdf-parse/worker');
    const { PDFParse } = await import('pdf-parse');
    parser = new PDFParse({ data: new Uint8Array(buffer) });
    const r = await parser.getText({ first: MAX_PAGINAS_PDF + 1 });
    return { texto: r.text, paginas: r.total };
  } catch (e) {
    console.warn('[conciliacion-ia] no se pudo sacar el texto del PDF; va el archivo', e instanceof Error ? e.message : e);
    return null;
  } finally {
    await parser?.destroy().catch(() => {});
  }
}
