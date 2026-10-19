/**
 * Comparativos entre dos períodos: «este mes vs el mes pasado», «ventas de
 * octubre contra septiembre». Aquí solo el formato y las cuentas; qué períodos
 * son y de dónde salen los números lo decide el contestador local.
 */

import { rd } from './util';
import { textoGrafico } from './grafico';

export type Metrica = 'ventas' | 'cobros' | 'gastos' | 'itbis';

export const ROTULO_METRICA: Record<Metrica, string> = {
  ventas: 'Ventas',
  cobros: 'Cobros',
  gastos: 'Gastos',
  itbis: 'ITBIS a pagar',
};

export interface LadoComparacion {
  etiqueta: string;
  /** Hasta qué día llega (YYYY-MM-DD): si es hoy, el período está incompleto. */
  hasta: string;
  valor: number;
}

export interface ResultadoComparacion {
  metrica: Metrica;
  a: LadoComparacion;
  b: LadoComparacion;
  hoy: string;
}

export const porcentaje = (nuevo: number, base: number): number | null =>
  base === 0 ? null : Math.round(((nuevo - base) / Math.abs(base)) * 1000) / 10;

const signo = (n: number) => (n > 0 ? '+' : n < 0 ? '−' : '');

function textoDiferencia(a: number, b: number): string {
  const dif = a - b;
  const pct = porcentaje(a, b);
  if (dif === 0) return 'sin cambio';
  return `${signo(dif)}${rd(Math.abs(dif))}${pct == null ? '' : ` (${signo(pct)}${Math.abs(pct).toLocaleString('en-US')}%)`}`;
}

export function formatearComparacion(c: ResultadoComparacion): string {
  const { metrica, a, b } = c;
  const nombre = ROTULO_METRICA[metrica];
  const dif = a.valor - b.valor;
  // Para gastos e ITBIS subir es «peor»; el texto no juzga, solo dice si sube o baja.
  const verbo = dif > 0 ? 'subió' : dif < 0 ? 'bajó' : 'se mantuvo igual';

  const lineas: string[] = [];
  if (a.valor === 0 && b.valor === 0) {
    return `No hay ${nombre.toLowerCase()} registrados ni en ${a.etiqueta} ni en ${b.etiqueta}.`;
  }
  lineas.push(
    dif === 0
      ? `**${nombre}** ${verbo} entre ${b.etiqueta} y ${a.etiqueta}: ${rd(a.valor)}.`
      : `**${nombre}** ${verbo} **${textoDiferencia(a.valor, b.valor)}** en ${a.etiqueta} respecto a ${b.etiqueta}.`,
  );

  const grafico = textoGrafico(`${nombre}: ${b.etiqueta} vs ${a.etiqueta}`, 'RD$', [
    { etiqueta: b.etiqueta, valor: b.valor },
    { etiqueta: a.etiqueta, valor: a.valor },
  ]);
  if (grafico) lineas.push('', grafico);

  lineas.push(
    '',
    '| Período | ' + nombre + ' |',
    '| --- | --- |',
    `| ${b.etiqueta} | ${rd(b.valor)} |`,
    `| ${a.etiqueta} | ${rd(a.valor)} |`,
    `| **Diferencia** | **${textoDiferencia(a.valor, b.valor)}** |`,
  );

  // Un período que llega hasta hoy está incompleto: comparar medio mes con un mes entero engaña.
  const incompletos = [a, b].filter((l) => l.hasta >= c.hoy);
  if (incompletos.length === 1) {
    lineas.push('', `Ojo: ${incompletos[0].etiqueta} todavía no termina, así que la diferencia está inflada hacia abajo. Para comparar parejo, espera a que cierre o compara el mismo tramo de días.`);
  }
  return lineas.join('\n');
}
