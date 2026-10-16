/**
 * «Lo que sueles preguntar»: las preguntas que esta persona repite. Se calcula
 * solo con SUS propias preguntas en esta empresa, y se descartan las que no
 * sirven de atajo: saludos, datos puntuales (un número de factura, un correo),
 * textos largos y cualquier cosa que una política responda con respuesta fija.
 */

import { clasificarSolicitud } from './politicas';
import { normalizar } from './util';

const TRIVIALES = /^(hola|gracias|ok|okay|listo|si|no|ayuda|buenas|buenos dias|buenas tardes|buenas noches|perfecto|entendido)\b/;

/** Preguntas cuyo sentido depende de la pantalla en que se hicieron: no son un atajo. */
const DEPENDE_DE_LA_PANTALLA = /\b(pantalla|estoy|estamos|aqui|esta (factura|cotizacion)|este (cliente|producto|registro)|esto)\b/;

export function frecuentesDe(
  /** De la más reciente a la más antigua. */
  preguntas: string[],
  opciones: { max?: number; minimo?: number; excluir?: string[] } = {},
): string[] {
  const max = opciones.max ?? 3;
  const minimo = opciones.minimo ?? 2;
  const excluir = new Set((opciones.excluir ?? []).map(normalizar));

  const grupos = new Map<string, { texto: string; veces: number; primera: number }>();
  preguntas.forEach((original, i) => {
    const texto = original.replace(/\s+/g, ' ').trim();
    const clave = normalizar(texto);
    if (clave.length < 8 || texto.length > 100) return;
    if (TRIVIALES.test(clave) || DEPENDE_DE_LA_PANTALLA.test(clave)) return;
    if (/\d{6,}/.test(clave) || /@/.test(texto) || /https?:\/\//i.test(texto)) return;
    if (excluir.has(clave)) return;
    if (clasificarSolicitud(texto)) return;
    const g = grupos.get(clave);
    if (g) g.veces++;
    else grupos.set(clave, { texto, veces: 1, primera: i });
  });

  return [...grupos.values()]
    .filter((g) => g.veces >= minimo)
    .sort((a, b) => b.veces - a.veces || a.primera - b.primera)
    .slice(0, max)
    .map((g) => g.texto);
}
