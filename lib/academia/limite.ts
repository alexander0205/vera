/**
 * Tope de lo que cuesta el asistente de la Academia.
 *
 * Cada pregunta al asistente es una llamada a un modelo (dinero). Se limita por
 * persona con el contador de la BASE (`rateLimitDb`, que vale entre instancias
 * de Vercel; el de memoria no): un tope por minuto y otro por día. Al pasarse
 * NO se rechaza la pregunta: se contesta con lo mejor del buscador, sin llamar
 * al modelo. Además hay un tope TOTAL por día para toda la plataforma. Si el contador mismo falla, se trata como pasado (falla cerrado).
 */

export type Limitador = (clave: string, max: number, ventanaMs: number) => Promise<{ allowed: boolean }>;

export const MAX_POR_MINUTO = 6;
export const MAX_POR_DIA = 40;
/** Tope de TODA la plataforma por día: un techo al gasto aunque haya muchas personas. */
export const MAX_GLOBAL_POR_DIA = 400;

export async function puedeLlamarAlModelo(userId: number, limitar: Limitador): Promise<boolean> {
  try {
    if (!(await limitar(`academia-preguntar-min:${userId}`, MAX_POR_MINUTO, 60_000)).allowed) return false;
    if (!(await limitar(`academia-preguntar-dia:${userId}`, MAX_POR_DIA, 24 * 3600_000)).allowed) return false;
    return (await limitar('academia-preguntar-global-dia', MAX_GLOBAL_POR_DIA, 24 * 3600_000)).allowed;
  } catch {
    return false;
  }
}
