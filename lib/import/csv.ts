/**
 * Utilidades de importación CSV (migración desde Alegra u otros).
 *
 * - Decodifica buffers latin-1 (Windows-1252) o UTF-8 automáticamente.
 *   Las facturas exportadas de Alegra vienen en win1252 con `sep=;`.
 * - Parseo robusto con papaparse (campos con comillas, saltos embebidos).
 * - Matching de columnas tolerante a acentos/mayúsculas.
 */

import Papa from 'papaparse';
import iconv from 'iconv-lite';

export type ImportMode = 'preview' | 'commit';

export type RowAction = 'create' | 'update' | 'skip';

export interface ImportRow<T> {
  /** Número de fila/grupo en el archivo (1-based, para que el usuario ubique errores). */
  ref: string;
  data: T;
  action: RowAction;
  /** Motivo cuando action = 'skip' o 'update'. */
  reason?: string;
}

export interface ImportResult<T> {
  mode: ImportMode;
  total: number;
  created: number;
  updated: number;
  skipped: number;
  errors: string[];
  rows: ImportRow<T>[];
}

/** Decodifica un Buffer detectando UTF-8 vs Windows-1252. */
export function decodeBuffer(buf: Buffer): string {
  const utf8 = iconv.decode(buf, 'utf-8');
  // El carácter de reemplazo (U+FFFD) indica que NO era UTF-8 válido → win1252.
  if (utf8.includes('�')) return iconv.decode(buf, 'win1252');
  return utf8;
}

/** Parsea texto CSV a filas-objeto. Maneja BOM y la directiva `sep=;` de Excel. */
export function parseCsv(text: string): Record<string, string>[] {
  let body = text.replace(/^﻿/, ''); // strip BOM

  // Directiva Excel `sep=;` en la primera línea → fija el delimitador.
  // Algunos exports de Alegra la prefijan con basura (BOM mal codificado → "?").
  let delimiter = '';
  const m = body.match(/^[?﻿\s]*sep=(.)\r?\n/i);
  if (m) {
    delimiter = m[1];
    body = body.slice(m[0].length);
  }

  const res = Papa.parse<Record<string, string>>(body, {
    header: true,
    skipEmptyLines: 'greedy',
    delimiter, // '' = auto-detectar
    transformHeader: (h) => h.trim(),
  });
  return res.data;
}

/** Normaliza una clave para comparación: sin acentos, minúsculas, sin espacios extra. */
export function normKey(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Toma el valor de la primera columna que coincida (tolerante a acentos/caso).
 * Ej: pick(row, 'RNC/Cédula', 'CLIENTE - RNC O CÉDULA').
 */
export function pick(row: Record<string, string>, ...names: string[]): string {
  const keys = Object.keys(row);
  for (const name of names) {
    const target = normKey(name);
    const k = keys.find((key) => normKey(key) === target);
    if (k && row[k] != null) return String(row[k]).trim();
  }
  return '';
}

/** Convierte string de monto ("2500.00", "1,500.00") a centavos enteros. */
export function toCents(raw: string): number {
  if (!raw) return 0;
  const cleaned = raw.replace(/[^\d.,-]/g, '').replace(/,/g, '');
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

/** Parsea fecha dd/mm/yyyy o yyyy-mm-dd → 'YYYY-MM-DD'. '' si inválida. */
export function toIsoDate(raw: string): string {
  if (!raw) return '';
  const s = raw.trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) {
    const d = m[1].padStart(2, '0');
    const mo = m[2].padStart(2, '0');
    return `${m[3]}-${mo}-${d}`;
  }
  return '';
}

/**
 * Cédula/RNC placeholder (todo ceros o casi) que Alegra usa para consumidor
 * final / clientes sin identificación. No sirve como RNC fiscal real.
 */
export function isPlaceholderRnc(rnc: string): boolean {
  const digits = rnc.replace(/\D/g, '');
  if (!digits) return true;
  return /^0+$/.test(digits) || digits.length < 9;
}
