/**
 * Lo que gasta la IA: tokens y costo de cada llamada a un modelo.
 *
 * Cada parte que llama a un modelo devuelve sus `Consumo` y quien guarda la
 * respuesta los registra con su empresa y su chat (ver consumo-servidor.ts).
 * El costo sale del catálogo de lib/ia/modelos.ts (US$ por millón de tokens) y
 * se guarda al momento: si el precio cambia, lo ya gastado se queda como fue.
 *
 * Este archivo no toca la base: lo usan las rutas y las pruebas.
 */
import { modeloPorId } from './modelos';

export type UsoConsumo = 'asistente' | 'decisiones' | 'plantillas' | 'captura' | 'redaccion';
export type ProveedorConsumo = 'anthropic' | 'gateway' | 'google' | 'typesafe';

export interface Consumo {
  uso: UsoConsumo;
  proveedor: ProveedorConsumo;
  /** El id del catálogo (`anthropic/claude-haiku-5.5`) o el del proveedor (`jev-1.14.0`). */
  modelo: string;
  tokensEntrada: number;
  tokensSalida: number;
  /** Leídos de la caché del proveedor; ya están dentro de `tokensEntrada`. */
  tokensCache?: number;
  /** Escritos en la caché (Anthropic los cobra 1.25×); también dentro de `tokensEntrada`. */
  tokensCacheEscritura?: number;
  /** Del asistente: si la pregunta fue normal o de análisis (lo que escogió el modelo). */
  nivel?: 'normal' | 'analisis';
}

/** Jev (TypeSafe) cobra solo la entrada: US$0.042 por millón. La salida es gratis. */
export const PRECIO_JEV_ENTRADA_USD = 0.042;

/**
 * El id del catálogo para un id que puede venir directo del proveedor:
 * `claude-haiku-5-5` (Anthropic directo) es `anthropic/claude-haiku-5.5`.
 */
export function idDeCatalogo(modelo: string): string {
  if (modelo.includes('/')) return modelo;
  const claude = /^claude-([a-z]+)-(\d+)-(\d+)$/.exec(modelo);
  if (claude) return `anthropic/claude-${claude[1]}-${claude[2]}.${claude[3]}`;
  if (modelo.startsWith('gemini-')) return `google/${modelo}`;
  return modelo;
}

/** Lo leído de la caché de Anthropic cuesta la décima parte de la entrada normal; escribirla (5 min), 1.25×. */
export const FACTOR_CACHE_LEIDA = 0.1;
export const FACTOR_CACHE_ESCRITA = 1.25;

/**
 * Costo en US$ de UNA llamada (el tramo de precio se decide por llamada). Un
 * modelo que no está en el catálogo cuesta 0.
 */
export function costoUsd(c: Pick<Consumo, 'modelo' | 'tokensEntrada' | 'tokensSalida' | 'tokensCache' | 'tokensCacheEscritura'>): number {
  const entrada = Math.max(0, c.tokensEntrada || 0);
  const salida = Math.max(0, c.tokensSalida || 0);
  if (c.modelo.startsWith('jev')) return (entrada * PRECIO_JEV_ENTRADA_USD) / 1e6;
  const m = modeloPorId(idDeCatalogo(c.modelo));
  if (!m) return 0;
  const p = m.largo && entrada > m.largo.desdeTokens ? m.largo : m;
  const leida = Math.min(entrada, Math.max(0, c.tokensCache || 0));
  const escrita = Math.min(entrada - leida, Math.max(0, c.tokensCacheEscritura || 0));
  const normal = entrada - leida - escrita;
  return (p.entradaUsd * (normal + leida * FACTOR_CACHE_LEIDA + escrita * FACTOR_CACHE_ESCRITA) + salida * p.salidaUsd) / 1e6;
}

/** Suma varias llamadas (un turno del chat puede tener Jev + el modelo + su respaldo). */
export function sumarConsumos(cs: Consumo[]): { tokensEntrada: number; tokensSalida: number; costoUsd: number } {
  return cs.reduce((a, c) => ({
    tokensEntrada: a.tokensEntrada + (c.tokensEntrada || 0),
    tokensSalida: a.tokensSalida + (c.tokensSalida || 0),
    costoUsd: a.costoUsd + costoUsd(c),
  }), { tokensEntrada: 0, tokensSalida: 0, costoUsd: 0 });
}

/** «US$0.0012», con los decimales que hacen falta para que un costo pequeño no se lea 0. */
export function usd(n: number): string {
  if (n === 0) return 'US$0';
  const decimales = n >= 1 ? 2 : n >= 0.01 ? 4 : 6;
  return `US$${n.toFixed(decimales)}`;
}

/** «2026-10» → el mes en hora de República Dominicana (UTC−4), como lo guarda la base (UTC sin zona). */
export function rangoDelMes(mes: string): { desde: Date; hasta: Date } | null {
  const m = /^(\d{4})-(\d{2})$/.exec(mes);
  if (!m) return null;
  const ano = Number(m[1]);
  const num = Number(m[2]);
  if (num < 1 || num > 12) return null;
  return {
    desde: new Date(Date.UTC(ano, num - 1, 1, 4)),
    hasta: new Date(Date.UTC(ano, num, 1, 4)),
  };
}
