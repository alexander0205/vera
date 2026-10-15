/**
 * Historial del asistente para el dueño: quién preguntó qué y qué se le
 * contestó. Aquí solo la parte pura (emparejar preguntas con respuestas y
 * limpiar el texto); la consulta a la base vive en la página.
 */

import { depurarSalida } from './politicas';

export interface FilaPregunta { id: number; conversacionId: number; contenido: string; creadoEn: Date; usuarioId: number; usuario: string }
export interface FilaRespuesta {
  id: number; conversacionId: number; contenido: string;
  herramientas: { nombre: string }[] | null; valoracion: number | null; valoracionMotivo: string | null;
}

export interface EntradaBitacora {
  id: number;
  fecha: Date;
  usuarioId: number;
  usuario: string;
  pregunta: string;
  respuesta: string | null;
  consultas: string[];
  valoracion: 1 | -1 | null;
  motivo: string | null;
}

const recorta = (t: string, max: number) => (t.length > max ? `${t.slice(0, max).trimEnd()}…` : t);

/** Quita enlaces y marcas de formato: en una lista resumida solo estorban. */
export function resumirRespuesta(md: string, max = 180): string {
  const plano = md
    .replace(/```[\s\S]*?```/g, ' [gráfico] ')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/^\|.*\|$/gm, ' ')
    .replace(/[*_`#>|-]{1,}/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return recorta(depurarSalida(plano).texto, max);
}

/**
 * Cada pregunta con la primera respuesta del asistente que le sigue en su
 * conversación. Ordenado de lo más reciente a lo más antiguo.
 */
export function emparejar(preguntas: FilaPregunta[], respuestas: FilaRespuesta[]): EntradaBitacora[] {
  const porConversacion = new Map<number, FilaRespuesta[]>();
  for (const r of respuestas) {
    const l = porConversacion.get(r.conversacionId) ?? [];
    l.push(r);
    porConversacion.set(r.conversacionId, l);
  }
  for (const l of porConversacion.values()) l.sort((a, b) => a.id - b.id);

  return preguntas
    .map((p) => {
      const r = (porConversacion.get(p.conversacionId) ?? []).find((x) => x.id > p.id) ?? null;
      return {
        id: p.id,
        fecha: p.creadoEn,
        usuarioId: p.usuarioId,
        usuario: p.usuario,
        pregunta: recorta(depurarSalida(p.contenido).texto.replace(/\s+/g, ' ').trim(), 300),
        respuesta: r ? resumirRespuesta(r.contenido) : null,
        consultas: [...new Set((r?.herramientas ?? []).map((h) => h.nombre))],
        valoracion: r?.valoracion === 1 ? 1 : r?.valoracion === -1 ? -1 : null,
        motivo: r?.valoracionMotivo ?? null,
      } satisfies EntradaBitacora;
    })
    .sort((a, b) => b.fecha.getTime() - a.fecha.getTime() || b.id - a.id);
}
