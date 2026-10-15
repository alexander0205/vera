/**
 * ¿Pidió el reporte fiscal del mes en Excel? («genera el 606 y 607 de
 * septiembre en excel», «dame el reporte fiscal del mes pasado»).
 *
 * Es una función pura: solo reconoce el pedido y el mes. Lo que se descarga lo
 * arma `app/api/asistente/reporte-fiscal` con los datos de la empresa de la
 * sesión; aquí no se toca nada.
 */

import { interpretarPeriodo } from './local';
import { hoyRd } from './util';

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
/** «septiembre 2026». */
export const nombrePeriodo = (anio: number, mes: number) => `${MESES[mes - 1]} ${anio}`;

export type PedidoFiscal =
  | { tipo: 'mes'; anio: number; mes: number }
  | { tipo: 'sin-mes' };

const normalizar = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Pregunta de «cómo se hace» o «qué es»: eso lo contesta la guía, no una descarga. */
const PREGUNTA_DE_AYUDA = /^\s*(como|donde|cuando|que es|que son|para que|por que|cual es|cuales son|puedo|se puede|explica)/;

const TEMA_FISCAL = /\b(606|607|reporte fiscal|reportes fiscales|paquete fiscal|reporte (para|del|de) (el )?contador|informe fiscal|compras y ventas del mes|ventas y compras del mes)\b/;
const ACCION = /\b(excel|xlsx|hoja de calculo|genera\w*|descarga\w*|dame|damelo|preparame|armame|prepara\w*|arma\w*|necesito|quiero|mandame|exporta\w*|saca\w*|bajame)\b/;

export function pedidoFiscal(texto: string, hoy = hoyRd()): PedidoFiscal | null {
  const t = normalizar(texto).replace(/\s+/g, ' ').trim();
  if (!t || t.length > 200) return null;
  if (PREGUNTA_DE_AYUDA.test(t)) return null;
  if (!TEMA_FISCAL.test(t) || !ACCION.test(t)) return null;

  const p = interpretarPeriodo(t, hoy);
  // Rango que no es un mes completo (últimos 3 meses, este año…): hay que pedir un mes.
  if (!p) return { tipo: 'sin-mes' };
  const [y1, m1] = p.desde.split('-').map(Number);
  const [y2, m2] = p.hasta.split('-').map(Number);
  if (y1 !== y2 || m1 !== m2) return { tipo: 'sin-mes' };
  // Sin período dicho, `interpretarPeriodo` devuelve el mes en curso.
  return { tipo: 'mes', anio: y1, mes: m1 };
}
