/**
 * El markdown del asistente como bloques. Lo usa el PDF (y se prueba sin
 * navegador): párrafos, títulos, listas y tablas, con negritas.
 */

import { parsearGrafico, type Grafico } from './grafico';
import { parsearTarjeta } from './tarjeta';

export interface Tramo { texto: string; negrita?: boolean }

export type Bloque =
  | { tipo: 'parrafo'; tramos: Tramo[] }
  | { tipo: 'titulo'; tramos: Tramo[] }
  | { tipo: 'lista'; ordenada: boolean; items: Tramo[][] }
  | { tipo: 'tabla'; cabecera: Tramo[][]; filas: Tramo[][][] }
  | { tipo: 'grafico'; grafico: Grafico };

/** `**negrita**` y `[texto](/ruta)` → solo el texto (en PDF el enlace no sirve). */
export function tramos(linea: string): Tramo[] {
  const limpia = linea
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/(^|[^*])\*([^*\s][^*]*)\*(?!\*)/g, '$1$2')
    .replace(/(^|\W)_([^_\s][^_]*)_(?=\W|$)/g, '$1$2');
  const out: Tramo[] = [];
  let i = 0;
  for (const m of limpia.matchAll(/\*\*([^*]+)\*\*/g)) {
    const idx = m.index ?? 0;
    if (idx > i) out.push({ texto: limpia.slice(i, idx) });
    out.push({ texto: m[1], negrita: true });
    i = idx + m[0].length;
  }
  if (i < limpia.length) out.push({ texto: limpia.slice(i) });
  return out.length ? out : [{ texto: '' }];
}

const celdas = (l: string) => l.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());
const esSeparador = (l: string) => /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(l);
const esFila = (l: string) => l.includes('|') && l.trim().length > 1;
const VINETA = /^\s*([-*•])\s+/;
const NUMERADA = /^\s*\d+[.)]\s+/;

export function aBloques(md: string): Bloque[] {
  const L = md.replace(/\r/g, '').split('\n');
  const out: Bloque[] = [];
  let i = 0;
  const tabla = (j: number) => esFila(L[j]) && j + 1 < L.length && esSeparador(L[j + 1]);

  while (i < L.length) {
    const l = L[i];
    if (!l.trim()) { i++; continue; }

    // Bloque con vallas: «grafico» es una gráfica; cualquier otro, texto tal cual.
    if (/^\s*```/.test(l)) {
      const lenguaje = l.trim().slice(3).trim().toLowerCase();
      const cuerpo: string[] = [];
      i++;
      while (i < L.length && !/^\s*```/.test(L[i])) { cuerpo.push(L[i]); i++; }
      i++;
      const g = lenguaje === 'grafico' ? parsearGrafico(cuerpo.join('\n')) : null;
      const tj = lenguaje === 'tarjeta' ? parsearTarjeta(cuerpo.join('\n')) : null;
      if (tj) {
        out.push({ tipo: 'titulo', tramos: [{ texto: tj.titulo + (tj.valor ? ' — ' + tj.valor : ''), negrita: true }] });
        const datos = [...(tj.subtitulo ? [['Detalle', tj.subtitulo]] : []), ...(tj.estado ? [['Estado', tj.estado.texto]] : []), ...tj.filas.map((f) => [f.etiqueta, f.valor])];
        if (datos.length) out.push({ tipo: 'tabla', cabecera: [[{ texto: 'Dato' }], [{ texto: 'Detalle' }]], filas: datos.map(([k, v]) => [[{ texto: k }], [{ texto: v }]]) });
      } else if (g) out.push({ tipo: 'grafico', grafico: g });
      else if (lenguaje === 'formulario') { /* el formulario no va en el reporte */ }
      else if (cuerpo.some((x) => x.trim())) out.push({ tipo: 'parrafo', tramos: tramos(cuerpo.join(' ')) });
      continue;
    }

    if (tabla(i)) {
      const cabecera = celdas(l).map(tramos);
      const filas: Tramo[][][] = [];
      i += 2;
      while (i < L.length && L[i].trim() && esFila(L[i])) { filas.push(celdas(L[i]).map(tramos)); i++; }
      out.push({ tipo: 'tabla', cabecera, filas });
      continue;
    }
    if (VINETA.test(l) || NUMERADA.test(l)) {
      const ordenada = NUMERADA.test(l);
      const re = ordenada ? NUMERADA : VINETA;
      const items: Tramo[][] = [];
      while (i < L.length && re.test(L[i])) { items.push(tramos(L[i].replace(re, ''))); i++; }
      out.push({ tipo: 'lista', ordenada, items });
      continue;
    }
    const h = l.match(/^#{1,4}\s+(.*)$/);
    if (h) { out.push({ tipo: 'titulo', tramos: tramos(h[1]) }); i++; continue; }

    const buf: string[] = [];
    while (i < L.length && L[i].trim() && !VINETA.test(L[i]) && !NUMERADA.test(L[i]) && !tabla(i) && !/^#{1,4}\s+/.test(L[i])) {
      buf.push(L[i]); i++;
    }
    if (!buf.length) { i++; continue; }
    out.push({ tipo: 'parrafo', tramos: tramos(buf.join(' ')) });
  }
  return out;
}

/** ¿La respuesta es «grande» (conviene ofrecer el PDF con más énfasis)? */
export function esRespuestaGrande(md: string): boolean {
  const filas = aBloques(md).reduce((s, b) => s + (b.tipo === 'tabla' ? b.filas.length : 0), 0);
  return filas >= 6 || md.length > 1500;
}

/** ¿La persona está pidiendo un Excel / hoja de cálculo? Tiene prioridad sobre «exportar» a secas. */
export function pideExcel(texto: string): boolean {
  const t = texto.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  return /\b(excel|xlsx|xls|hoja de calculo|hoja electronica|spreadsheet|planilla)\b/.test(t);
}

/** ¿La respuesta trae datos que valen en una hoja (tabla, gráfico o tarjeta)? */
export function tieneDatosTabulares(md: string): boolean {
  return /^\|.+\|\s*$/m.test(md) && /^\|?\s*:?-{2,}/m.test(md) || /```(grafico|tarjeta)/.test(md);
}

/** ¿La persona está pidiendo un PDF / reporte descargable? */
export function pidePdf(texto: string): boolean {
  if (pideExcel(texto)) return false;
  const t = texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  return /\b(pdf|en pdf|como pdf|imprimir|imprimible|descargar|descargable|exportar|exporta|reporte (imprimible|en archivo)|genera(me)? un (reporte|documento))\b/.test(t);
}
