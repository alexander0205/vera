/**
 * Lo que se le entrega al agente humano cuando la persona pide «hablar con
 * alguien»: la conversación con el asistente, para que no tenga que repetir
 * nada. Va como el primer mensaje del ticket.
 */

export interface MensajeResumen { rol: string; contenido: string }

const MAX_TOTAL = 3500;
const MAX_POR_MENSAJE = 700;

/** Quita el markdown de tablas y negritas: el agente lo lee como texto plano. */
function plano(t: string): string {
  return t
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/^\s*\|?\s*:?-{2,}[\s|:-]*$/gm, '')
    .split('\n')
    .map((l) => (l.includes('|')
      ? l.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim()).join(' · ')
      : l))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function armarResumenParaAgente(mensajes: MensajeResumen[]): string {
  const cabecera = 'Pidió hablar con una persona después de usar el asistente. Conversación:';
  const lineas = mensajes
    .filter((m) => m.contenido.trim())
    .map((m) => {
      const quien = m.rol === 'user' ? 'Cliente' : 'Asistente';
      const t = plano(m.contenido);
      return `${quien}: ${t.length > MAX_POR_MENSAJE ? `${t.slice(0, MAX_POR_MENSAJE)}…` : t}`;
    });

  // Si se pasa del tope se conserva lo MÁS reciente, que es lo que motivó la derivación.
  let cuerpo = '';
  for (let i = lineas.length - 1; i >= 0; i--) {
    const siguiente = `${lineas[i]}\n\n${cuerpo}`;
    if (siguiente.length > MAX_TOTAL && cuerpo) break;
    cuerpo = siguiente;
  }
  return `${cabecera}\n\n${cuerpo}`.trim();
}
