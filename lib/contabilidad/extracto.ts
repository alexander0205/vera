/**
 * El estado de cuenta del banco (CSV o Excel): leerlo y emparejarlo con el libro.
 *
 * Todo puro, sin base ni red, para probar el emparejamiento sin levantar nada.
 * Lo que toca la base vive en `conciliacion.ts`.
 *
 * Convenciones:
 *  · Los montos del extracto van CON SIGNO desde el punto de vista del banco de
 *    la empresa: positivo = entró dinero (depósito, crédito), negativo = salió
 *    (retiro, cargo). Es el mismo signo que el libro (`debe − haber` de una
 *    cuenta de banco), así que emparejar es comparar números iguales.
 *  · Las fechas dominicanas van día/mes/año.
 */

import { createHash } from 'crypto';

// ── Lectura del archivo ──────────────────────────────────────────────────────

export interface FilaExtracto {
  /** Número de fila en el archivo (1 = primera), para decirle al usuario dónde mirar. */
  fila: number;
  fecha: string;
  descripcion: string | null;
  referencia: string | null;
  /** Con signo: + entró, − salió. En centavos. */
  montoCents: number;
  saldoCents: number | null;
}

export interface ErrorFilaExtracto { fila: number; mensaje: string }

export interface ExtractoLeido {
  filas: FilaExtracto[];
  errores: ErrorFilaExtracto[];
  /** Las columnas que se reconocieron, para enseñárselas a quien sube el archivo. */
  columnas: { fecha: string; descripcion: string | null; referencia: string | null; monto: string; saldo: string | null };
}

export class ExtractoError extends Error {
  constructor(message: string) { super(message); this.name = 'ExtractoError'; }
}

/** Más de esto no es un estado de cuenta, es un archivo equivocado. */
export const MAX_FILAS_EXTRACTO = 5000;

const sinAcentos = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '');
const norm = (v: unknown) => sinAcentos(String(v ?? '')).toLowerCase().replace(/[^a-z0-9/ ]+/g, ' ').replace(/\s+/g, ' ').trim();

const SINONIMOS: Record<string, string[]> = {
  fecha: ['fecha', 'fecha valor', 'fecha de operacion', 'fecha operacion', 'fecha transaccion', 'fecha de transaccion', 'fecha contable', 'fecha posteo', 'date'],
  descripcion: ['descripcion', 'concepto', 'detalle', 'detalle de la transaccion', 'descripcion de la transaccion', 'narrativa', 'description', 'comentario'],
  referencia: ['referencia', 'numero de referencia', 'no referencia', 'nro referencia', 'ref', 'documento', 'no documento', 'numero de documento', 'num doc', 'no de transaccion', 'id transaccion', 'secuencia', 'numero de transaccion', 'cheque'],
  debito: ['debito', 'debitos', 'debe', 'retiro', 'retiros', 'cargo', 'cargos', 'salida', 'salidas', 'withdrawal', 'debit'],
  credito: ['credito', 'creditos', 'haber', 'deposito', 'depositos', 'abono', 'abonos', 'entrada', 'entradas', 'credit', 'deposit'],
  monto: ['monto', 'importe', 'valor', 'amount', 'monto de la transaccion'],
  saldo: ['saldo', 'balance', 'saldo disponible', 'saldo final', 'saldo contable'],
  tipo: ['tipo', 'tipo de movimiento', 'tipo de transaccion', 'dc', 'd/c', 'naturaleza', 'db/cr'],
};

type Campo = keyof typeof SINONIMOS;

/** Orden en que se prueba «contiene»: lo más específico primero («saldo» antes que «monto», «débito» antes que «cargo»). */
const ORDEN_CONTIENE: Campo[] = ['fecha', 'saldo', 'debito', 'credito', 'referencia', 'descripcion', 'tipo', 'monto'];

function campoDe(encabezado: unknown): Campo | null {
  const n = norm(encabezado);
  if (!n) return null;
  for (const [campo, lista] of Object.entries(SINONIMOS)) if (lista.includes(n)) return campo as Campo;
  // «Débito (RD$)», «Fecha de la operación», «Número de referencia bancaria»: se reconoce por la palabra, sin acentos.
  // Un encabezado que habla de descripción, concepto o detalle es texto, no un importe: «Descripción del cargo»
  // no es el débito.
  const esTexto = /descripci|concepto|detalle|narrativ/.test(n);
  const envuelto = ` ${n} `;
  for (const campo of ORDEN_CONTIENE) {
    if (esTexto && campo !== 'descripcion') continue;
    if (SINONIMOS[campo].some((sin) => sin.length >= 4 && envuelto.includes(` ${sin} `))) return campo;
  }
  return null;
}

/** ¿El encabezado es EXACTAMENTE uno de los nombres conocidos del campo? */
function esExacto(encabezado: unknown): Campo | null {
  const n = norm(encabezado);
  if (!n) return null;
  for (const [campo, lista] of Object.entries(SINONIMOS)) if (lista.includes(n)) return campo as Campo;
  return null;
}

/** Texto de una celda, venga como venga (texto, número, fecha, objeto de ExcelJS). */
export function textoCelda(v: unknown): string {
  if (v == null) return '';
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === 'object') {
    const o = v as { text?: unknown; result?: unknown; richText?: { text: string }[] };
    if (Array.isArray(o.richText)) return o.richText.map((r) => r.text).join('').trim();
    if (o.result !== undefined) return textoCelda(o.result);
    if (o.text !== undefined) return textoCelda(o.text);
    return '';
  }
  return String(v).trim();
}

function fechaReal(a: number, m: number, d: number): string | null {
  if (a < 2000 || a > 2100) return null;
  const f = new Date(Date.UTC(a, m - 1, d));
  if (f.getUTCFullYear() !== a || f.getUTCMonth() !== m - 1 || f.getUTCDate() !== d) return null;
  return f.toISOString().slice(0, 10);
}

/** Una fecha de estado de cuenta: ISO, día/mes/año, un Date de Excel o el número de serie de Excel. */
export function leerFecha(v: unknown, orden: 'dmy' | 'mdy' = 'dmy'): string | null {
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : fechaReal(v.getUTCFullYear(), v.getUTCMonth() + 1, v.getUTCDate());
  if (typeof v === 'number') {
    if (v < 20_000 || v > 80_000) return null;
    const f = new Date(Date.UTC(1899, 11, 30) + Math.floor(v) * 86_400_000);
    return fechaReal(f.getUTCFullYear(), f.getUTCMonth() + 1, f.getUTCDate());
  }
  const t = textoCelda(v);
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(t);
  if (m) return fechaReal(Number(m[1]), Number(m[2]), Number(m[3]));
  m = /^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2}|\d{4})(?!\d)/.exec(t);
  if (m) {
    const a = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    return orden === 'mdy' ? fechaReal(a, Number(m[1]), Number(m[2])) : fechaReal(a, Number(m[2]), Number(m[1]));
  }
  return null;
}

/**
 * ¿El archivo trae las fechas mes/día/año? En RD son día/mes/año, pero un
 * extracto exportado de otro sistema puede venir al revés. Se decide mirando todo
 * el archivo: si alguna fecha tiene un número mayor que 12 en la SEGUNDA posición
 * (y ninguna en la primera), es mes/día.
 */
export function ordenDeFechas(valores: readonly unknown[]): 'dmy' | 'mdy' {
  let segundaMayor = false; let primeraMayor = false;
  for (const v of valores) {
    if (typeof v === 'number' || v instanceof Date) continue;
    const m = /^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2}|\d{4})(?!\d)/.exec(textoCelda(v));
    if (!m) continue;
    if (Number(m[2]) > 12) segundaMayor = true;
    if (Number(m[1]) > 12) primeraMayor = true;
  }
  return segundaMayor && !primeraMayor ? 'mdy' : 'dmy';
}

/**
 * Un monto del extracto a centavos, con signo. Admite «1,234.56», «1.234,56»,
 * «(500.00)» y «500.00-» como negativos, y símbolos de moneda. Más de dos
 * decimales o texto raro devuelve null: un monto dudoso no se adivina.
 */
export function leerMonto(v: unknown): number | null {
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) return null;
    const c = Math.round(v * 100);
    return Math.abs(v * 100 - c) > 1e-6 ? null : c;
  }
  let t = textoCelda(v).replace(/rd\$|dop|\$|\s/gi, '');
  if (t === '') return null;
  let negativo = false;
  if (/^\(.*\)$/.test(t)) { negativo = true; t = t.slice(1, -1); }
  if (t.endsWith('-')) { negativo = true; t = t.slice(0, -1); }
  if (t.startsWith('-')) { negativo = !negativo; t = t.slice(1); }
  if (t.startsWith('+')) t = t.slice(1);
  if (!/^[\d.,]+$/.test(t) || !/\d/.test(t)) return null;

  const ultimaComa = t.lastIndexOf(',');
  const ultimoPunto = t.lastIndexOf('.');
  let enteros: string; let decimales = '';
  if (ultimaComa >= 0 && ultimoPunto >= 0) {
    const sepDec = ultimaComa > ultimoPunto ? ',' : '.';
    const i = t.lastIndexOf(sepDec);
    enteros = t.slice(0, i).replace(/[.,]/g, ''); decimales = t.slice(i + 1);
  } else if (ultimaComa >= 0 || ultimoPunto >= 0) {
    const sep = ultimaComa >= 0 ? ',' : '.';
    const partes = t.split(sep);
    const ultima = partes[partes.length - 1];
    // «0.500» y «00,500» no son miles (nadie escribe 0 mil): son 0.50.
    const agrupado = partes.length > 2 || (ultima.length === 3 && partes[0].length >= 1 && partes[0].length <= 3 && !/^0+$/.test(partes[0]));
    if (agrupado) {
      // 1,500 · 1.500.000: el separador es de miles. (Un punto o coma con 3 dígitos al final se toma por miles.)
      if (!partes.slice(1).every((p) => p.length === 3)) return null;
      enteros = partes.join('');
    } else {
      enteros = partes[0]; decimales = ultima;
    }
  } else {
    enteros = t;
  }
  // Ceros de más al final («0.500») no cambian el monto; dígitos distintos de cero sí: no se adivinan.
  if (decimales.length > 2 && /^\d{2}0+$/.test(decimales)) decimales = decimales.slice(0, 2);
  if (decimales.length > 2 || !/^\d*$/.test(enteros) || !/^\d*$/.test(decimales)) return null;
  const cents = Number(enteros || '0') * 100 + Number((decimales + '00').slice(0, 2));
  if (!Number.isSafeInteger(cents)) return null;
  return negativo ? -cents : cents;
}

/** Un CSV a matriz: comillas, delimitador `,` `;` o tabulador (se detecta), BOM y saltos de línea de cualquier sistema. */
export function leerCsv(texto: string): string[][] {
  const t = texto.replace(/^﻿/, '');
  const primera = t.split(/\r?\n/, 1)[0] ?? '';
  const cuenta = (c: string) => primera.split(c).length - 1;
  const delim = [',', ';', '\t'].map((c) => ({ c, n: cuenta(c) })).sort((a, b) => b.n - a.n)[0];
  const sep = delim.n > 0 ? delim.c : ',';

  const filas: string[][] = [];
  let fila: string[] = []; let celda = ''; let comillas = false;
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (comillas) {
      if (ch === '"') { if (t[i + 1] === '"') { celda += '"'; i++; } else comillas = false; }
      else celda += ch;
    } else if (ch === '"') comillas = true;
    else if (ch === sep) { fila.push(celda); celda = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && t[i + 1] === '\n') i++;
      fila.push(celda); celda = '';
      if (fila.some((c) => c.trim() !== '')) filas.push(fila);
      fila = [];
    } else celda += ch;
  }
  fila.push(celda);
  if (fila.some((c) => c.trim() !== '')) filas.push(fila);
  return filas;
}

/**
 * Interpreta la matriz de un estado de cuenta: busca la fila de encabezados
 * (los bancos ponen datos de la cuenta arriba), reconoce las columnas por su
 * nombre y devuelve las filas con monto con signo. Lo que no se pueda leer va a
 * `errores` con su número de fila; no se descarta en silencio.
 */
export function interpretarExtracto(matriz: unknown[][]): ExtractoLeido {
  if (matriz.length > MAX_FILAS_EXTRACTO + 30) {
    throw new ExtractoError(`El archivo trae más de ${MAX_FILAS_EXTRACTO} movimientos. Sube el estado de cuenta por tramos (por ejemplo, un mes).`);
  }

  let encabezado = -1;
  let mapa: Partial<Record<Campo, number>> = {};
  for (let i = 0; i < Math.min(matriz.length, 30); i++) {
    const m: Partial<Record<Campo, number>> = {};
    const fila = matriz[i] ?? [];
    // Primero lo exacto, después lo que solo «contiene»: «Cargo» exacto gana a «Descripción del cargo».
    fila.forEach((c, j) => { const campo = esExacto(c); if (campo && m[campo] === undefined) m[campo] = j; });
    fila.forEach((c, j) => {
      if (Object.values(m).includes(j)) return;
      const campo = campoDe(c);
      if (campo && m[campo] === undefined) m[campo] = j;
    });
    const traeMonto = m.monto !== undefined || m.debito !== undefined || m.credito !== undefined;
    if (m.fecha !== undefined && traeMonto) { encabezado = i; mapa = m; break; }
  }
  if (encabezado < 0) {
    throw new ExtractoError('No encontré las columnas del estado de cuenta. Hacen falta al menos «Fecha» y «Monto» (o «Débito» y «Crédito»).');
  }

  const nombres = (matriz[encabezado] ?? []).map(textoCelda);
  const ordenFechas = mapa.fecha === undefined ? 'dmy' : ordenDeFechas(matriz.slice(encabezado + 1).map((r) => (r ?? [])[mapa.fecha!]));
  const filas: FilaExtracto[] = [];
  const errores: ErrorFilaExtracto[] = [];

  for (let i = encabezado + 1; i < matriz.length; i++) {
    const r = matriz[i] ?? [];
    const n = i + 1;
    if (r.every((c) => textoCelda(c) === '')) continue;
    const celda = (campo: Campo) => (mapa[campo] === undefined ? undefined : r[mapa[campo]!]);

    const fecha = leerFecha(celda('fecha'), ordenFechas);
    if (!fecha) {
      // Las filas de totales o saldos que ponen los bancos («Total», «Saldo inicial») no son movimientos;
      // una fecha con dígitos que no existe sí es un error que hay que decir.
      if (/\d/.test(textoCelda(celda('fecha')))) errores.push({ fila: n, mensaje: `La fecha «${textoCelda(celda('fecha'))}» no es válida.` });
      continue;
    }

    let montoCents: number | null = null;
    if (mapa.debito !== undefined || mapa.credito !== undefined) {
      const d = textoCelda(celda('debito')) === '' ? 0 : leerMonto(celda('debito'));
      const c = textoCelda(celda('credito')) === '' ? 0 : leerMonto(celda('credito'));
      if (d === null || c === null) { errores.push({ fila: n, mensaje: 'El monto del débito o crédito no es un número válido.' }); continue; }
      montoCents = Math.abs(c) - Math.abs(d);
    } else {
      const m = leerMonto(celda('monto'));
      if (m === null) { errores.push({ fila: n, mensaje: `El monto «${textoCelda(celda('monto'))}» no es un número válido.` }); continue; }
      montoCents = m;
      const tipo = norm(celda('tipo'));
      if (tipo) {
        const esDebito = /^(d|db|debito|debit|retiro|cargo|salida)\b/.test(tipo);
        const esCredito = /^(c|cr|credito|credit|deposito|abono|entrada)\b/.test(tipo);
        if (esDebito) montoCents = -Math.abs(m);
        else if (esCredito) montoCents = Math.abs(m);
      }
    }
    if (montoCents === 0) continue; // una línea sin importe no es un movimiento

    const saldo = textoCelda(celda('saldo')) === '' ? null : leerMonto(celda('saldo'));
    const descripcion = textoCelda(celda('descripcion')).replace(/\s+/g, ' ').slice(0, 300) || null;
    const referencia = textoCelda(celda('referencia')).replace(/\s+/g, ' ').slice(0, 120) || null;
    filas.push({ fila: n, fecha, descripcion, referencia, montoCents, saldoCents: saldo });
  }

  if (filas.length === 0 && errores.length === 0) throw new ExtractoError('El estado de cuenta no trae movimientos.');
  if (filas.length > MAX_FILAS_EXTRACTO) {
    throw new ExtractoError(`El archivo trae más de ${MAX_FILAS_EXTRACTO} movimientos. Sube el estado de cuenta por tramos (por ejemplo, un mes).`);
  }

  const col = (c: Campo) => (mapa[c] === undefined ? null : nombres[mapa[c]!] || null);
  return {
    filas, errores,
    columnas: {
      fecha: col('fecha')!, descripcion: col('descripcion'), referencia: col('referencia'),
      monto: mapa.monto !== undefined ? col('monto')! : [col('debito'), col('credito')].filter(Boolean).join(' / '),
      saldo: col('saldo'),
    },
  };
}

/**
 * La huella de una línea, para no importar dos veces la misma. `ocurrencia` es
 * cuántas líneas idénticas (misma fecha, monto, referencia y descripción) van
 * antes en el archivo: dos pagos iguales el mismo día son dos movimientos, y al
 * subir un tramo que se traslapa con otro los dos siguen siendo los mismos dos.
 */
export function huellaLinea(cuentaId: number, f: Pick<FilaExtracto, 'fecha' | 'montoCents' | 'referencia' | 'descripcion'>, ocurrencia: number): string {
  const base = [cuentaId, f.fecha, f.montoCents, norm(f.referencia), norm(f.descripcion), ocurrencia].join('|');
  return createHash('sha256').update(base).digest('hex');
}

/** Las huellas de todas las filas de un archivo, contando las repetidas. */
export function huellasDeFilas(cuentaId: number, filas: readonly FilaExtracto[]): string[] {
  const vistas = new Map<string, number>();
  return filas.map((f) => {
    const clave = [f.fecha, f.montoCents, norm(f.referencia), norm(f.descripcion)].join('|');
    const n = vistas.get(clave) ?? 0;
    vistas.set(clave, n + 1);
    return huellaLinea(cuentaId, f, n);
  });
}

// ── Emparejar con el libro ───────────────────────────────────────────────────

export interface LineaExtractoPorEmparejar {
  id: number;
  fecha: string;
  /** Con signo: + entró, − salió. */
  montoCents: number;
  referencia: string | null;
  descripcion: string | null;
}

export interface LineaLibroPorEmparejar {
  id: number;
  fecha: string;
  /** `debe − haber` de la cuenta de banco: + entró, − salió. */
  montoCents: number;
  /** Concepto del asiento, descripción de la línea y referencia: donde puede aparecer la del extracto. */
  texto: string;
}

export interface ParEmparejado {
  extractoId: number;
  libroId: number;
  /** 'referencia' = la referencia del banco aparece en el libro; 'monto-fecha' = mismo monto y fecha cercana. */
  motivo: 'referencia' | 'monto-fecha';
}

/** Días entre el movimiento del banco y el apunte del libro para unirlos solos. */
export const DIAS_MAX_EMPAREJAR = 7;
/** Hasta aquí se SUGIERE un apunte para revisar a mano; nunca se une solo. */
export const DIAS_SUGERENCIA = 45;

export interface ResultadoEmparejar {
  pares: ParEmparejado[];
  /** Hay más de un candidato, o dos líneas del banco compiten por el mismo apunte: lo decide una persona. */
  ambiguas: { extractoId: number; candidatos: number[] }[];
  /** Mismo monto pero entre 7 y 45 días de diferencia: se ofrece para revisar, nunca se une solo. */
  sugeridas: { extractoId: number; candidatos: number[] }[];
}

/** Una referencia más corta que esto aparece en cualquier parte: no sirve para emparejar. */
export const REFERENCIA_MINIMA = 6;

const clave = (t: string | null | undefined) => sinAcentos(t ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');

function dias(a: string, b: string): number {
  return Math.abs(Math.round((Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86_400_000));
}

/**
 * Empareja líneas del extracto con apuntes del libro de la misma cuenta, solo
 * cuando no hay duda.
 *
 *  1. Mismo monto, dentro de la ventana (±7 días) Y la referencia del banco
 *     (6 caracteres o más) aparece en el texto del apunte.
 *  2. Mismo monto y fecha cercana (±7 días) con un único mejor candidato.
 *
 * Nunca se empareja por su cuenta cuando: hay dos candidatos igual de buenos, o
 * dos líneas del banco compiten por el mismo apunte SIN que una sea claramente
 * la más cercana (ninguna se une: quedan `ambiguas`). Si cada línea y su apunte son
 * la mejor pareja el uno del otro, a la distancia mínima y sin empate, se unen. La excepción son movimientos IDÉNTICOS (misma fecha y monto) en la
 * misma cantidad de los dos lados: son intercambiables y se unen en orden.
 * Entre 7 y `DIAS_SUGERENCIA` días solo se sugiere. Un apunte se usa una vez y
 * nunca se empareja un monto distinto.
 */
export function emparejar(
  extracto: readonly LineaExtractoPorEmparejar[],
  libro: readonly LineaLibroPorEmparejar[],
  opciones: { diasMax?: number; diasSugerencia?: number } = {},
): ResultadoEmparejar {
  const diasMax = opciones.diasMax ?? DIAS_MAX_EMPAREJAR;
  const diasSug = opciones.diasSugerencia ?? DIAS_SUGERENCIA;
  const libres = new Map(libro.map((l) => [l.id, l]));
  const pendientes = new Map(extracto.map((e) => [e.id, e]));
  const pares: ParEmparejado[] = [];
  const textos = new Map(libro.map((l) => [l.id, clave(l.texto)]));

  const unir = (e: LineaExtractoPorEmparejar, l: LineaLibroPorEmparejar, motivo: ParEmparejado['motivo']) => {
    pares.push({ extractoId: e.id, libroId: l.id, motivo });
    libres.delete(l.id); pendientes.delete(e.id);
  };
  const candidatosDe = (e: LineaExtractoPorEmparejar, conReferencia: boolean) => {
    const ref = clave(e.referencia);
    return [...libres.values()].filter((l) =>
      l.montoCents === e.montoCents && dias(l.fecha, e.fecha) <= diasMax
      && (!conReferencia || (textos.get(l.id) ?? '').includes(ref)));
  };
  const masCercano = (e: LineaExtractoPorEmparejar, cs: LineaLibroPorEmparejar[]) =>
    [...cs].sort((a, b) => dias(a.fecha, e.fecha) - dias(b.fecha, e.fecha) || a.id - b.id);

  /**
   * Una ronda: une las líneas con una sola salida clara y sin competencia.
   * `conReferencia` restringe a los apuntes que citan la referencia del banco.
   */
  const ronda = (conReferencia: boolean): boolean => {
    let avance = false;
    const lista = [...pendientes.values()]
      .filter((e) => !conReferencia || clave(e.referencia).length >= REFERENCIA_MINIMA)
      .sort((a, b) => a.fecha.localeCompare(b.fecha) || a.id - b.id);
    // Quién reclama a cada apunte (con las mismas reglas), para detectar competencia.
    const reclamantes = new Map<number, number[]>();
    const cands = new Map<number, LineaLibroPorEmparejar[]>();
    for (const e of lista) {
      const cs = masCercano(e, candidatosDe(e, conReferencia));
      cands.set(e.id, cs);
      for (const c of cs) reclamantes.set(c.id, [...(reclamantes.get(c.id) ?? []), e.id]);
    }
    for (const e of lista) {
      if (!pendientes.has(e.id)) continue;
      const cs = (cands.get(e.id) ?? []).filter((c) => libres.has(c.id));
      if (cs.length === 0) continue;
      const [mejor, segundo] = cs;
      // Dos candidatos a la misma distancia y en fechas distintas: no se adivina.
      if (segundo && dias(mejor.fecha, e.fecha) === dias(segundo.fecha, e.fecha) && mejor.fecha !== segundo.fecha) continue;
      const otros = (reclamantes.get(mejor.id) ?? []).filter((id) => id !== e.id && pendientes.has(id));
      // Mejor pareja la una de la otra: este apunte está más cerca de esta línea que de CUALQUIER otra que lo
      // reclame (sin empate). Así cinco cobros iguales en días seguidos se unen cada uno con el suyo.
      const dMejor = dias(mejor.fecha, e.fecha);
      const parejaMutua = otros.every((id) => dias(mejor.fecha, pendientes.get(id)!.fecha) > dMejor);
      if (otros.length > 0 && !parejaMutua) {
        // Competencia: solo es seguro si los reclamantes son idénticos a esta línea (misma fecha y monto) y
        // hay tantos apuntes iguales como reclamantes; entonces da igual cuál se lleva cuál.
        const grupo = [e, ...otros.map((id) => pendientes.get(id)!)];
        const identicos = grupo.every((g) => g.fecha === e.fecha && g.montoCents === e.montoCents);
        const iguales = cs.filter((c) => c.fecha === mejor.fecha);
        if (!identicos || iguales.length !== grupo.length) continue;
      }
      unir(e, mejor, conReferencia ? 'referencia' : 'monto-fecha');
      avance = true;
    }
    return avance;
  };

  for (let i = 0; i < 6 && ronda(true); i++) { /* varias rondas: al unir una, otra queda sin competencia */ }
  for (let i = 0; i < 6 && ronda(false); i++) { /* idem */ }

  const ambiguas: ResultadoEmparejar['ambiguas'] = [];
  const sugeridas: ResultadoEmparejar['sugeridas'] = [];
  for (const e of pendientes.values()) {
    const dentro = [...libres.values()].filter((l) => l.montoCents === e.montoCents && dias(l.fecha, e.fecha) <= diasMax);
    if (dentro.length > 0) {
      ambiguas.push({ extractoId: e.id, candidatos: dentro.map((c) => c.id) });
      continue;
    }
    const lejos = [...libres.values()].filter((l) => l.montoCents === e.montoCents && dias(l.fecha, e.fecha) <= diasSug);
    if (lejos.length > 0) sugeridas.push({ extractoId: e.id, candidatos: lejos.map((c) => c.id) });
  }
  return { pares, ambiguas, sugeridas };
}
