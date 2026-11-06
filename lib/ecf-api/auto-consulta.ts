/**
 * Consulta automática del estado DGII al abrir una pantalla.
 *
 * No hay poller en el servidor (se quitó para que Neon pueda dormir de
 * noche): quien mira un e-CF «En proceso» dispara la consulta, sin bloquear
 * la pantalla, con un tope por documento para no martillar a ecf-api.
 */

/** Mínimo entre dos consultas automáticas del mismo documento. */
export const AUTO_CONSULTA_MIN_MS = 2 * 60_000;
/** Máximo de documentos que una lista consulta por carga. */
export const AUTO_CONSULTA_MAX_LISTA = 5;

const CLAVE = 'zero.ecf.autoConsulta';

/** Los ids de `ids` que toca consultar ahora (respeta el tope de tiempo y el de cantidad). */
export function idsParaConsultar(
  ids: number[],
  ultimas: Record<string, number>,
  ahora: number,
  max: number = AUTO_CONSULTA_MAX_LISTA,
  minMs: number = AUTO_CONSULTA_MIN_MS,
): number[] {
  const out: number[] = [];
  for (const id of ids) {
    if (out.length >= max) break;
    const ult = ultimas[String(id)];
    if (ult !== undefined && ahora - ult < minMs) continue;
    out.push(id);
  }
  return out;
}

const enMemoria: Record<string, number> = {};

function leer(): Record<string, number> {
  try {
    const raw = sessionStorage.getItem(CLAVE);
    return { ...(raw ? JSON.parse(raw) : {}), ...enMemoria };
  } catch {
    return { ...enMemoria };
  }
}

function guardar(ultimas: Record<string, number>) {
  Object.assign(enMemoria, ultimas);
  try { sessionStorage.setItem(CLAVE, JSON.stringify(ultimas)); } catch { /* sin storage: queda en memoria */ }
}

/**
 * Consulta en segundo plano los documentos indicados (los que pasan el tope).
 * Devuelve true si alguno cambió de estado. Nunca lanza.
 */
export async function consultarEstadosEnSegundoPlano(
  ids: number[],
  max: number = AUTO_CONSULTA_MAX_LISTA,
): Promise<boolean> {
  const ahora = Date.now();
  const ultimas = leer();
  const tocan = idsParaConsultar(ids, ultimas, ahora, max);
  if (tocan.length === 0) return false;
  for (const id of tocan) ultimas[String(id)] = ahora;
  guardar(ultimas);

  let cambio = false;
  await Promise.all(tocan.map(async (id) => {
    try {
      const res = await fetch(`/api/ecf/estado?docId=${id}`);
      if (!res.ok) return;
      const data = await res.json();
      if (data?.actualizado) cambio = true;
    } catch { /* silencioso: es un refresco oportunista */ }
  }));
  return cambio;
}
