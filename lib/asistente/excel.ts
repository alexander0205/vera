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
  /** Nombre de la pestaña (≤31 caracteres). */
  nombre: string;
  /** Título visible arriba de la tabla (el encabezado del reporte), si lo hay. */
  titulo: string | null;
  /** datos: tabla o gráfico · texto: respuesta sin cifras · info: de dónde salió. */
  tipo: 'datos' | 'texto' | 'info';
  /** La primera fila es el encabezado. */
  filas: Celda[][];
  /** Columnas que son cifras (se alinean a la derecha y se suman en el ancho). */
  numericas: boolean[];
  /** Columnas a las que tiene sentido ponerles un total (montos y conteos, no promedios ni %). */
  sumables: boolean[];
}

const NO_SE_SUMA = /promedio|%|porcentaje|dias|d[ií]as|vencid|antig|ticket|precio|tasa|min[ií]mo/i;
const CONTEO_SUMABLE = /^(facturas?|pagos?|unidades|cantidad|estudiantes|emitidas?|borradores?|clientes?|registros?)$/i;

/** ¿Tiene sentido un total al pie de esta columna? Montos sí; conteos con nombre claro sí; lo demás no. */
export function columnasSumables(encabezado: Celda[], cuerpo: Celda[][], numericas: boolean[]): boolean[] {
  if (cuerpo.length < 2) return encabezado.map(() => false);
  return encabezado.map((h, j) => {
    if (!numericas[j]) return false;
    const nombre = h.tipo === 'texto' ? h.valor : '';
    if (NO_SE_SUMA.test(nombre)) return false;
    const celdas = cuerpo.map((f) => f[j]).filter((c): c is Extract<Celda, { tipo: 'numero' }> => c?.tipo === 'numero');
    if (celdas.length === 0) return false;
    if (celdas.every((c) => c.formato === FORMATO_PESOS)) return true;
    return celdas.every((c) => Number.isInteger(c.valor) && c.formato === FORMATO_ENTERO) && CONTEO_SUMABLE.test(nombre.trim());
  });
}

const FORMATO_PESOS = '"RD$" #,##0.00;[Red]-"RD$" #,##0.00';
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
  /** El último párrafo antes de una tabla es casi siempre su encabezado («Tus mejores clientes este mes:»). */
  let ultimoTexto: string | null = null;
  let nTabla = 0;
  let nGrafico = 0;
  /** La tabla que sigue a un gráfico es su detalle. */
  let veniaDeGrafico = false;
  // Con un solo reporte la pestaña se llama «Reporte»; con varios, por su título o su número.
  const totalDatos = bloques.filter((x) => x.tipo === 'tabla' || x.tipo === 'grafico').length;
  const limpiarTexto = (t: string) => t.replace(/[:：]\s*$/, '').trim() || null;

  for (const b of bloques) {
    if (b.tipo === 'titulo') { titulo = plano(b.tramos); continue; }
    if (b.tipo === 'parrafo') { ultimoTexto = limpiarTexto(plano(b.tramos)); continue; }
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
      const visible = titulo ?? ultimoTexto;
      hojas.push({
        nombre: nombreDeHoja(titulo ?? (totalDatos === 1 ? 'Reporte' : veniaDeGrafico ? 'Detalle' : `Tabla ${nTabla}`), usados),
        titulo: visible, tipo: 'datos', filas: [encabezado, ...cuerpo], numericas,
        sumables: columnasSumables(encabezado, cuerpo, numericas),
      });
      titulo = null;
      ultimoTexto = null;
      veniaDeGrafico = false;
      continue;
    }
    if (b.tipo === 'grafico') {
      nGrafico++;
      const g = b.grafico;
      const formato = g.unidad === 'RD$' ? FORMATO_PESOS : FORMATO_DECIMAL;
      hojas.push({
        nombre: nombreDeHoja(g.titulo ?? (totalDatos === 1 ? 'Reporte' : `Gráfico ${nGrafico}`), usados),
        titulo: g.titulo ?? ultimoTexto, tipo: 'datos',
        sumables: [false, g.unidad === 'RD$'],
        filas: [
          [{ tipo: 'texto', valor: 'Etiqueta' }, { tipo: 'texto', valor: g.unidad === 'RD$' ? 'Monto (RD$)' : 'Valor' }],
          ...g.datos.map((d): Celda[] => [{ tipo: 'texto', valor: d.etiqueta }, { tipo: 'numero', valor: d.valor, formato }]),
        ],
        numericas: [false, true],
      });
      // El encabezado de la respuesta también encabeza la tabla que viene después del gráfico.
      titulo = null;
      veniaDeGrafico = true;
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
      titulo: null, tipo: 'texto', sumables: [false],
      filas: [[{ tipo: 'texto', valor: 'Respuesta' }], ...lineas.filter(Boolean).map((l): Celda[] => [{ tipo: 'texto', valor: l }])],
      numericas: [false],
    });
  }

  const info = (k: string, v: string): Celda[] => [{ tipo: 'texto', valor: k }, { tipo: 'texto', valor: v }];
  hojas.push({
    nombre: nombreDeHoja('Información', usados),
    titulo: 'Información del reporte', tipo: 'info', sumables: [false, false],
    filas: [
      [{ tipo: 'texto', valor: 'Dato' }, { tipo: 'texto', valor: 'Detalle' }],
      info('Empresa', meta.empresa),
      ...(meta.usuario ? [info('Generado por', meta.usuario)] : []),
      info('Fecha', meta.generadoEn),
      info('Nota', 'Generado por el asistente de Zero. Revisa las cifras importantes antes de decidir.'),
    ],
    numericas: [false, false],
  });

  return { hojas };
}
