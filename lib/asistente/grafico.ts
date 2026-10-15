/**
 * Gráfico de barras dentro de una respuesta. Va como un bloque de texto, así
 * viaja igual por el chat, el historial y el PDF, y no hay nada que interpretar
 * como HTML:
 *
 *   ```grafico
 *   titulo: Ventas por mes
 *   unidad: RD$
 *   Agosto | 120000
 *   Septiembre | 98000.5
 *   ```
 *
 * Sin imports de servidor: lo usan el chat (cliente), el PDF y las plantillas.
 */

export interface DatoGrafico { etiqueta: string; valor: number }

export interface Grafico {
  titulo: string | null;
  /** «RD$» → montos; vacío → cantidades. */
  unidad: 'RD$' | '';
  datos: DatoGrafico[];
}

const MAX_BARRAS = 12;

const limpia = (t: string, max: number) => t.replace(/[|\r\n`]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
const limpiaEtiqueta = (t: string) => limpia(t, 40);
const limpiaTitulo = (t: string) => limpia(t, 90);

/** Texto del bloque a partir de datos ya calculados. `null` si no hay qué graficar. */
export function textoGrafico(titulo: string, unidad: 'RD$' | '', datos: DatoGrafico[]): string | null {
  const validos = datos.filter((d) => Number.isFinite(d.valor) && d.valor > 0).slice(0, MAX_BARRAS);
  // Una sola barra no dice nada que la frase no diga.
  if (validos.length < 2) return null;
  return [
    '```grafico',
    `titulo: ${limpiaTitulo(titulo)}`,
    ...(unidad ? [`unidad: ${unidad}`] : []),
    ...validos.map((d) => `${limpiaEtiqueta(d.etiqueta) || '—'} | ${Math.round(d.valor * 100) / 100}`),
    '```',
  ].join('\n');
}

/** El cuerpo del bloque (sin las vallas) a datos. `null` si no se entiende. */
export function parsearGrafico(cuerpo: string): Grafico | null {
  let titulo: string | null = null;
  let unidad: 'RD$' | '' = '';
  const datos: DatoGrafico[] = [];
  for (const crudo of cuerpo.replace(/\r/g, '').split('\n')) {
    const linea = crudo.trim();
    if (!linea) continue;
    const meta = linea.match(/^(titulo|unidad)\s*:\s*(.*)$/i);
    if (meta) {
      if (meta[1].toLowerCase() === 'titulo') titulo = limpiaTitulo(meta[2]) || null;
      else unidad = /^rd\$?$/i.test(meta[2].trim()) ? 'RD$' : '';
      continue;
    }
    const i = linea.lastIndexOf('|');
    if (i < 0) return null;
    const valor = Number(linea.slice(i + 1).trim().replace(/,/g, ''));
    if (!Number.isFinite(valor) || valor < 0) return null;
    datos.push({ etiqueta: limpiaEtiqueta(linea.slice(0, i)) || '—', valor });
  }
  if (datos.length < 2 || datos.length > MAX_BARRAS) return null;
  return { titulo, unidad, datos };
}

export const valorGrafico = (g: Grafico, v: number) =>
  `${g.unidad ? `${g.unidad} ` : ''}${v.toLocaleString('en-US', {
    minimumFractionDigits: g.unidad ? 2 : 0, maximumFractionDigits: g.unidad ? 2 : 2,
  })}`;

/** Ancho de cada barra, de 0 a 100, respecto a la mayor. */
export const anchoBarra = (g: Grafico, v: number) => {
  const max = Math.max(...g.datos.map((d) => d.valor));
  return max > 0 ? Math.max(2, Math.round((v / max) * 100)) : 0;
};
