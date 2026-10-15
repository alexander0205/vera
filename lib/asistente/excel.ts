/**
 * Excel de una respuesta del asistente. Solo exporta lo que ESA respuesta ya
 * mostró (tablas, gráficos, tarjetas, texto): no consulta nada nuevo, así que
 * no abre un camino para sacar más datos de los que la persona ya vio.
 *
 * Aquí la parte pura: de los bloques de la respuesta a hojas con celdas ya
 * tipadas. La ruta es la que escribe el archivo con ExcelJS.
 *
 * Seguridad de las celdas: todo texto va como TEXTO (nunca como fórmula), así
 * que un nombre de cliente que empiece con «=», «+», «-» o «@» no se ejecuta
 * al abrir el archivo (inyección de fórmulas). Los números solo se convierten
 * cuando son claramente cifras; los identificadores (RNC, e-NCF, códigos con
 * ceros a la izquierda) se quedan como texto para no perder nada.
 */

import type { Bloque, Tramo } from './bloques';

export type Celda =
  | { tipo: 'texto'; valor: string }
  | { tipo: 'numero'; valor: number; formato: string }
  | { tipo: 'fecha'; valor: Date };

export interface Hoja {
  nombre: string;
  /** La primera fila es el encabezado. */
  filas: Celda[][];
  /** Columnas que son cifras (se alinean a la derecha y se suman en el ancho). */
  numericas: boolean[];
}

const FORMATO_PESOS = '"RD$" #,##0.00';
const FORMATO_ENTERO = '#,##0';
const FORMATO_DECIMAL = '#,##0.00';
const FORMATO_PORCENTAJE = '0.0%';

const num = (s: string) => Number(s.replace(/,/g, ''));

/** Un texto del chat → celda tipada. Lo dudoso se queda como texto. */
export function aCelda(crudo: string): Celda {
  const t = crudo.replace(/\s+/g, ' ').trim();
  if (!t) return { tipo: 'texto', valor: '' };

  // Montos: «RD$ 1,234.50», «-RD$ 5.00»
  let m = t.match(/^(-?)RD\$\s?(-?[\d,]+(?:\.\d+)?)$/);
  if (m) {
    const v = num(m[2]);
    if (Number.isFinite(v)) return { tipo: 'numero', valor: m[1] ? -Math.abs(v) : v, formato: FORMATO_PESOS };
  }

  // Porcentajes: «67%»
  m = t.match(/^(-?[\d,]+(?:\.\d+)?)%$/);
  if (m) {
    const v = num(m[1]);
    if (Number.isFinite(v)) return { tipo: 'numero', valor: v / 100, formato: FORMATO_PORCENTAJE };
  }

  // Fechas ISO: «2026-10-08»
  m = t.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) {
    const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
    if (!Number.isNaN(d.getTime()) && d.getUTCMonth() === Number(m[2]) - 1) return { tipo: 'fecha', valor: d };
  }

  // Cifras sueltas: «96», «1,234», «45.5». Nada con ceros a la izquierda ni de 9+ dígitos (RNC, cédula, e-NCF).
  m = t.match(/^-?[\d,]+(?:\.\d+)?$/);
  if (m) {
    const limpio = t.replace(/,/g, '');
    const soloDigitos = limpio.replace(/[-.]/g, '');
    const ceroAlInicio = /^-?0\d/.test(limpio);
    const comasBien = !t.includes(',') || /^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(t);
    if (!ceroAlInicio && soloDigitos.length < 9 && comasBien) {
      const v = Number(limpio);
      if (Number.isFinite(v)) return { tipo: 'numero', valor: v, formato: t.includes('.') ? FORMATO_DECIMAL : FORMATO_ENTERO };
    }
  }

  return { tipo: 'texto', valor: t };
}

const plano = (tramos: Tramo[]) => tramos.map((x) => x.texto).join('').replace(/\n/g, ' ').trim();

const PROHIBIDOS_EN_NOMBRE = /[\\/*?:[\]]/g;

/** Nombre de hoja válido en Excel (≤31, sin \ / * ? : [ ]) y sin repetirse. */
export function nombreDeHoja(crudo: string, usados: Set<string>): string {
  const base = (crudo.replace(PROHIBIDOS_EN_NOMBRE, ' ').replace(/\s+/g, ' ').trim() || 'Hoja').slice(0, 31);
  let nombre = base;
  let n = 2;
  while (usados.has(nombre.toLowerCase())) {
    const sufijo = ` (${n++})`;
    nombre = base.slice(0, 31 - sufijo.length) + sufijo;
  }
  usados.add(nombre.toLowerCase());
  return nombre;
}

export interface MetaLibro {
  empresa: string;
  usuario: string | null;
  generadoEn: string;
  pregunta: string | null;
  consultas: string[];
}

export interface Libro { hojas: Hoja[] }

/**
 * De los bloques de una respuesta a hojas. Cada tabla es una hoja (con el
 * título que la precede, si lo hay); cada gráfico, una hoja de etiqueta y
 * valor; si la respuesta no trae tablas ni gráficos, una hoja con el texto.
 * Siempre al final una hoja «Información» con de dónde salió.
 */
export function armarLibro(bloques: Bloque[], meta: MetaLibro): Libro {
  const usados = new Set<string>();
  const hojas: Hoja[] = [];
  let titulo: string | null = null;
  let nTabla = 0;
  let nGrafico = 0;

  for (const b of bloques) {
    if (b.tipo === 'titulo') { titulo = plano(b.tramos); continue; }
    if (b.tipo === 'tabla') {
      nTabla++;
      const encabezado: Celda[] = b.cabecera.map((c) => ({ tipo: 'texto', valor: plano(c) }));
      const cuerpo = b.filas.map((f) => f.map((c) => aCelda(plano(c))));
      const columnas = encabezado.length;
      // Una columna es numérica si todas sus celdas con valor lo son.
      const numericas = Array.from({ length: columnas }, (_, j) => {
        const celdas = cuerpo.map((f) => f[j]).filter((c) => c && !(c.tipo === 'texto' && c.valor === ''));
        return celdas.length > 0 && celdas.every((c) => c.tipo === 'numero');
      });
      hojas.push({ nombre: nombreDeHoja(titulo ?? `Tabla ${nTabla}`, usados), filas: [encabezado, ...cuerpo], numericas });
      titulo = null;
      continue;
    }
    if (b.tipo === 'grafico') {
      nGrafico++;
      const g = b.grafico;
      const formato = g.unidad === 'RD$' ? FORMATO_PESOS : FORMATO_DECIMAL;
      hojas.push({
        nombre: nombreDeHoja(g.titulo ?? `Gráfico ${nGrafico}`, usados),
        filas: [
          [{ tipo: 'texto', valor: 'Etiqueta' }, { tipo: 'texto', valor: g.unidad === 'RD$' ? 'Monto (RD$)' : 'Valor' }],
          ...g.datos.map((d): Celda[] => [{ tipo: 'texto', valor: d.etiqueta }, { tipo: 'numero', valor: d.valor, formato }]),
        ],
        numericas: [false, true],
      });
      titulo = null;
    }
  }

  // Sin datos tabulares: el texto de la respuesta, una línea por fila.
  if (hojas.length === 0) {
    const lineas: string[] = [];
    for (const b of bloques) {
      if (b.tipo === 'parrafo' || b.tipo === 'titulo') lineas.push(plano(b.tramos));
      else if (b.tipo === 'lista') b.items.forEach((it, i) => lineas.push(`${b.ordenada ? `${i + 1}.` : '•'} ${plano(it)}`));
    }
    hojas.push({
      nombre: nombreDeHoja('Respuesta', usados),
      filas: [[{ tipo: 'texto', valor: 'Respuesta' }], ...lineas.filter(Boolean).map((l): Celda[] => [{ tipo: 'texto', valor: l }])],
      numericas: [false],
    });
  }

  const info = (k: string, v: string): Celda[] => [{ tipo: 'texto', valor: k }, { tipo: 'texto', valor: v }];
  hojas.push({
    nombre: nombreDeHoja('Información', usados),
    filas: [
      [{ tipo: 'texto', valor: 'Dato' }, { tipo: 'texto', valor: 'Detalle' }],
      info('Empresa', meta.empresa),
      ...(meta.usuario ? [info('Generado por', meta.usuario)] : []),
      info('Fecha', meta.generadoEn),
      ...(meta.pregunta ? [info('Consulta', meta.pregunta)] : []),
      ...(meta.consultas.length ? [info('Datos consultados', meta.consultas.join(' · '))] : []),
      info('Nota', 'Generado por el asistente de Zero. Revisa las cifras importantes antes de decidir.'),
    ],
    numericas: [false, false],
  });

  return { hojas };
}
