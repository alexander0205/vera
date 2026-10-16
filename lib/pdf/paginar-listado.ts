/**
 * Reparte un listado en páginas ANTES de pasárselo a react-pdf.
 *
 * Por qué: con todas las filas en un solo <Page>, react-pdf vuelve a maquetar
 * lo que queda cada vez que corta una página, y el tiempo crece cuadrático:
 * 800 filas tardaban 5 s y 1600, 18 s — un libro diario de 1700 asientos se
 * pasaba del límite de 60 s de la ruta. Con cada página ya armada, cada una se
 * maqueta sola y el tiempo crece lineal (1600 filas, 3 s). Además así sabemos
 * cuántas páginas hay y el «Página X de N» no necesita la segunda pasada de
 * `render`, que duplicaba el coste.
 *
 * El alto de cada fila se estima por el texto que lleva (cuántas líneas ocupa
 * en el ancho de su columna) y se deja un margen de seguridad. Si una página se
 * pasara igual, react-pdf la parte sola: nunca se corta contenido.
 */

export type CeldaTexto = string | { texto: string; sub?: string | null };

export interface ColumnaMedida {
  /** Porcentaje del ancho ('12.5%'). */
  ancho: string;
  mono?: boolean;
  negrita?: boolean;
}

export type ItemListado<G, F> =
  | { tipo: 'grupo'; grupo: G }
  | { tipo: 'fila'; fila: F }
  | { tipo: 'total' }
  | { tipo: 'nota' }
  | { tipo: 'vacio' };

/** Medidas de la página A4 apaisada de ListadoPDF, en puntos. */
export const MEDIDAS = {
  altoPagina: 595.28,
  anchoPagina: 841.89,
  padding: 28,
  paddingBottom: 36,
  encabezado: 32,
  thead: 17,
  /** Filtro + tarjetas, solo en la primera página. */
  introSinKpis: 18,
  introConKpis: 70,
  grupo: 22,
  total: 18,
  nota: 16,
  vacio: 30,
  linea: 9.4,
  paddingFila: 7,
  /** Margen de seguridad sobre lo estimado. */
  seguridad: 1,
};

const ANCHO_LETRA = { normal: 3.9, negrita: 4.2, mono: 4.8 } as const;

/** Líneas que ocupa un texto en un ancho, partiendo por palabras (estimación por exceso). */
export function lineas(texto: string, anchoPt: number, letra: number): number {
  const porLinea = Math.max(4, Math.floor((anchoPt - 6) / letra));
  let n = 1, usado = 0;
  for (const palabra of texto.split(/\s+/).filter(Boolean)) {
    // Las mayúsculas y los dígitos son más anchos que la letra media: un
    // nombre en mayúsculas ocupa más líneas de las que dice su largo.
    let largo = 0;
    for (const ch of palabra) largo += /[A-ZÁÉÍÓÚÑ0-9@MW]/.test(ch) ? 1.3 : 1;
    largo = Math.ceil(largo);
    const sep = usado ? 1 : 0;
    if (usado + sep + largo <= porLinea) { usado += sep + largo; continue; }
    if (usado) n++;
    // Una palabra más larga que la línea se cuenta como varias líneas.
    while (largo > porLinea) { n++; largo -= porLinea; }
    usado = largo;
  }
  return n;
}

/** Alto estimado de una fila, en puntos. */
export function altoFila(celdas: CeldaTexto[], columnas: ColumnaMedida[]): number {
  const anchoUtil = MEDIDAS.anchoPagina - MEDIDAS.padding * 2;
  let max = 1;
  celdas.forEach((c, i) => {
    const col = columnas[i];
    if (!col) return;
    const anchoPt = (parseFloat(col.ancho) / 100) * anchoUtil;
    const letra = col.mono ? ANCHO_LETRA.mono : col.negrita ? ANCHO_LETRA.negrita : ANCHO_LETRA.normal;
    const texto = typeof c === 'string' ? c : c.texto;
    const sub = typeof c === 'string' ? null : c.sub;
    const n = lineas(texto, anchoPt, letra) + (sub ? lineas(sub, anchoPt, ANCHO_LETRA.normal) : 0);
    if (n > max) max = n;
  });
  return max * MEDIDAS.linea + MEDIDAS.paddingFila;
}

/**
 * Reparte los items en páginas. Un título de grupo nunca queda solo al pie, y
 * un grupo de hasta 6 filas no se parte entre dos páginas.
 */
export function paginar<G, F>(
  items: ItemListado<G, F>[],
  alto: (item: ItemListado<G, F>) => number,
  conKpis: boolean,
): ItemListado<G, F>[][] {
  const util = (MEDIDAS.altoPagina - MEDIDAS.padding - MEDIDAS.paddingBottom) * MEDIDAS.seguridad
    - MEDIDAS.encabezado - MEDIDAS.thead;
  const paginas: ItemListado<G, F>[][] = [[]];
  let libre = util - (conKpis ? MEDIDAS.introConKpis : MEDIDAS.introSinKpis);
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const h = alto(item);
    // Un grupo chico (un asiento de pocas líneas) va entero en una página; uno
    // grande, al menos con su primera fila.
    let necesita = h;
    if (item.tipo === 'grupo') {
      let filas = 0, altoFilas = 0;
      for (let j = i + 1; j < items.length && items[j].tipo === 'fila'; j++) { filas++; altoFilas += alto(items[j]); }
      const siguiente = items[i + 1];
      necesita += filas > 0 && filas <= 6 ? altoFilas : siguiente?.tipo === 'fila' ? alto(siguiente) : 0;
    }
    if (necesita > libre && paginas[paginas.length - 1].length > 0) {
      paginas.push([]);
      libre = util;
    }
    paginas[paginas.length - 1].push(item);
    libre -= h;
  }
  return paginas;
}
