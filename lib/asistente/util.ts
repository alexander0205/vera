import { sql, type SQL } from 'drizzle-orm';
import { z } from 'zod';

/**
 * Lo que comparten todas las piezas del asistente. Vivía copiado en tres
 * archivos de herramientas y en la guía, y las copias ya se habían separado
 * (una quitaba tildes con escapes, otra con caracteres sueltos).
 */

/** Centavos → pesos. Los reportes guardan centavos; el modelo y las plantillas hablan en pesos. */
export const pesos = (centavos: number | string | null | undefined) => Math.round(Number(centavos) || 0) / 100;

/** RD$ 12,345.67 */
export const rd = (montoPesos: number) =>
  `RD$ ${montoPesos.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Fecha YYYY-MM-DD que el modelo puede mandar a una herramienta. */
export const fechaYmd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Usa YYYY-MM-DD');

/** Date o texto → YYYY-MM-DD (hora local del servidor, igual que parseRango). */
export const ymd = (d: Date | string | null | undefined) =>
  d == null ? null : typeof d === 'string' ? d.slice(0, 10) : d.toLocaleDateString('en-CA');

/** «Pérez» → «perez». */
export const quitarTildes = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Para comparar textos libres: sin tildes, minúsculas y solo letras, números y espacios. */
export const normalizar = (t: string) => quitarTildes(t).replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();

/** `col` contiene `texto`, sin distinguir tildes ni mayúsculas, en SQL. */
export const contiene = (col: unknown, texto: string): SQL =>
  sql`translate(lower(${col}), 'áéíóúüñ', 'aeiouun') LIKE ${'%' + quitarTildes(texto) + '%'}`;

/** Hoy en República Dominicana, YYYY-MM-DD. */
export const hoyRd = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Santo_Domingo' });
