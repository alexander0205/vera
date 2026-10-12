/**
 * Empleados ida y vuelta por Excel: qué columnas lleva el archivo y cómo se lee
 * una fila. Sin base de datos: lo que toca la base vive en `empleados-importar.ts`.
 *
 * El ciclo es el mismo del catálogo de cuentas: se descarga la plantilla (que ya
 * trae a los empleados que hay), se completa o corrige en Excel y se vuelve a
 * subir. La llave es la CÉDULA: una cédula nueva crea al empleado, una que ya
 * existe lo actualiza con lo que cambió. Una celda vacía NUNCA borra lo que ya
 * está, e importar nunca da de baja a nadie.
 *
 * Todo lo que una persona puede teclear mal se atrapa aquí, con el número de fila
 * de Excel, antes de tocar la base: una cédula que Excel convirtió en número y
 * perdió el cero inicial, un salario escrito «35.000,50», una fecha como texto,
 * una cuenta de banco sin tipo.
 */

import { normalizar, textoCelda } from '@/lib/contabilidad/cuentas-excel';
import { pesosACentavos } from '@/lib/nomina/montos';

/** Encabezados tal como salen en el archivo de la plantilla, en orden. */
export const COLUMNAS_EMPLEADOS = [
  'Cédula',
  'Nombres',
  'Apellidos',
  'Cargo',
  'Salario mensual (RD$)',
  'Frecuencia de pago',
  'Fecha de ingreso',
  'Banco',
  'Cuenta bancaria',
  'Tipo de cuenta',
  'AFP',
  'ARS',
  'Días de vacaciones',
  'Incentivo fijo por corrida (RD$)',
  'Teléfono',
  'Correo',
] as const;

export const MAX_FILAS_EMPLEADOS = 3000;
/** Un salario mensual por encima de esto es casi seguro un cero de más. */
export const SALARIO_MAX_CENTS = 1_000_000_000; // RD$10,000,000
export const INCENTIVO_MAX_CENTS = 1_000_000_000;

export type Campo =
  | 'cedula' | 'nombres' | 'apellidos' | 'cargo' | 'salario' | 'frecuencia' | 'ingreso'
  | 'banco' | 'cuenta' | 'tipoCuenta' | 'afp' | 'ars' | 'vacaciones' | 'incentivo' | 'telefono' | 'correo';

/** Cómo puede llamarse cada columna. Se compara ya normalizado. */
const ALIAS: Record<Campo, string[]> = {
  cedula:     ['cedula', 'cedula de identidad', 'documento', 'id'],
  nombres:    ['nombres', 'nombre', 'primer nombre'],
  apellidos:  ['apellidos', 'apellido'],
  cargo:      ['cargo', 'puesto', 'posicion'],
  salario:    ['salario mensual (rd$)', 'salario mensual', 'salario', 'sueldo', 'sueldo mensual', 'salario base'],
  frecuencia: ['frecuencia de pago', 'frecuencia', 'periodicidad'],
  ingreso:    ['fecha de ingreso', 'ingreso', 'fecha ingreso', 'fecha de entrada'],
  banco:      ['banco'],
  cuenta:     ['cuenta bancaria', 'cuenta', 'numero de cuenta', 'no. de cuenta'],
  tipoCuenta: ['tipo de cuenta', 'tipo cuenta'],
  afp:        ['afp'],
  ars:        ['ars'],
  vacaciones: ['dias de vacaciones', 'vacaciones', 'dias vacaciones'],
  incentivo:  ['incentivo fijo por corrida (rd$)', 'incentivo fijo por corrida', 'incentivo fijo', 'incentivo'],
  telefono:   ['telefono', 'tel', 'celular'],
  correo:     ['correo', 'email', 'correo electronico'],
};

/** Lo que cabe en cada columna de la base (varchar). Pasarse haría fallar el guardado de TODO el archivo. */
const LARGO_MAX: Partial<Record<Campo, number>> = {
  nombres: 160, apellidos: 160, cargo: 120, afp: 80, ars: 80, banco: 80, telefono: 30, correo: 160,
};

/**
 * Texto de una celda listo para guardar: sin caracteres de control (el NUL rompe
 * la base) ni de dirección de texto (U+202E «invierte» lo que se lee y sirve para
 * disfrazar un nombre), con los espacios normalizados.
 */
export function limpiarTextoCelda(t: string): string {
  // eslint-disable-next-line no-control-regex
  return t.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F​-‏‪-‮⁦-⁩﻿]/g, '').replace(/\s+/g, ' ').trim();
}

/** Una fila del archivo, ya interpretada. `undefined` = la celda venía vacía (no se toca). */
export interface FilaEmpleado {
  /** Número de fila en Excel (1 = encabezado), para decirle al usuario dónde mirar. */
  fila: number;
  /** 11 dígitos. */
  cedula: string;
  nombres?: string;
  apellidos?: string;
  cargo?: string;
  salarioCents?: number;
  frecuencia?: 'mensual' | 'quincenal' | 'semanal';
  ingreso?: string;
  banco?: string;
  cuenta?: string;
  tipoCuenta?: 'ahorros' | 'corriente';
  afp?: string;
  ars?: string;
  vacaciones?: number;
  incentivoCents?: number;
  telefono?: string;
  correo?: string;
}

export interface ErrorFilaEmpleado {
  fila: number;
  cedula: string;
  mensaje: string;
}

export type AvisoFilaEmpleado = ErrorFilaEmpleado;

// ─── Lectura de cada tipo de celda ───────────────────────────────────────────

/** El valor crudo de una celda con formato (richText, fórmula, enlace) reducido a lo útil. */
function crudo(valor: unknown): unknown {
  if (valor && typeof valor === 'object' && !(valor instanceof Date)) {
    const v = valor as Record<string, unknown>;
    if ('result' in v) return crudo(v.result);
  }
  return valor;
}

/**
 * La cédula. Excel guarda `00100000001` como el número 100000001 y se pierde el
 * cero inicial: si llega como número se rellena a 11 dígitos y se avisa. Se
 * aceptan guiones y espacios («001-0000000-1»). Otra cosa que no sean 11 dígitos
 * se rechaza: adivinar una cédula crearía un empleado duplicado.
 */
export function leerCedula(valor: unknown): { cedula?: string; aviso?: string; error?: string } {
  const v = crudo(valor);
  const texto = textoCelda(v);
  if (texto === '') return { error: 'Falta la cédula.' };
  const digitos = texto.replace(/[\s-]/g, '');
  if (!/^\d+$/.test(digitos)) return { error: `La cédula «${texto}» solo puede llevar números (y guiones).` };
  if (digitos.length === 11) return { cedula: digitos };
  if (typeof v === 'number' && digitos.length >= 8 && digitos.length < 11) {
    return {
      cedula: digitos.padStart(11, '0'),
      aviso: `Excel quitó el cero inicial de la cédula (${texto}); se tomó como ${digitos.padStart(11, '0')}. Formatea la columna como Texto para evitarlo.`,
    };
  }
  return { error: `La cédula «${texto}» debe tener 11 dígitos.` };
}

/** Pesos de una celda → centavos. Un número de Excel llega con basura de decimales (30000.300000000003). */
export function leerPesos(valor: unknown, nombre: string): { cents?: number; error?: string } {
  const v = crudo(valor);
  if (v === null || v === undefined || textoCelda(v) === '') return {};
  if (typeof v === 'number') {
    if (!Number.isFinite(v) || v < 0) return { error: `${nombre} no es un monto válido.` };
    const cents = Math.round(v * 100);
    if (Math.abs(v * 100 - cents) > 1e-4) return { error: `${nombre} no puede tener más de dos decimales (${v}).` };
    return { cents };
  }
  const cents = pesosACentavos(textoCelda(v));
  if (cents === null) {
    return { error: `${nombre} «${textoCelda(v)}» no es un monto válido: escribe solo el número, por ejemplo 35,000.00.` };
  }
  return { cents };
}

/** Fecha → 'YYYY-MM-DD'. Acepta la fecha de Excel, 2026-01-15 y 15/01/2026 (día primero, como se escribe aquí). */
export function leerFecha(valor: unknown, hoy: string): { fecha?: string; error?: string } {
  const v = crudo(valor);
  const texto = textoCelda(v);
  if (texto === '') return {};
  let iso: string | null = null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(texto)) iso = texto;
  else {
    const m = texto.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
    if (m) iso = `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  }
  if (!iso) return { error: `La fecha «${texto}» no se entiende. Usa día/mes/año, por ejemplo 15/01/2026.` };
  const [a, mes, d] = iso.split('-').map(Number);
  const f = new Date(Date.UTC(a, mes - 1, d));
  if (f.getUTCFullYear() !== a || f.getUTCMonth() !== mes - 1 || f.getUTCDate() !== d) {
    return { error: `La fecha «${texto}» no existe en el calendario.` };
  }
  if (a < 1950) return { error: `La fecha «${texto}» es demasiado antigua.` };
  // Un año de gracia: se puede cargar quien entra el mes que viene, no uno de 2099.
  const limite = `${Number(hoy.slice(0, 4)) + 1}${hoy.slice(4)}`;
  if (iso > limite) return { error: `La fecha de ingreso «${texto}» está a más de un año en el futuro.` };
  return { fecha: iso };
}

export function leerFrecuencia(texto: string): 'mensual' | 'quincenal' | 'semanal' | null {
  const t = normalizar(texto);
  if (['mensual', 'mes', 'm'].includes(t)) return 'mensual';
  if (['quincenal', 'quincena', 'q'].includes(t)) return 'quincenal';
  if (['semanal', 'semana', 's'].includes(t)) return 'semanal';
  return null;
}

export function leerTipoCuenta(texto: string): 'ahorros' | 'corriente' | null {
  const t = normalizar(texto);
  if (['ahorros', 'ahorro', 'a'].includes(t)) return 'ahorros';
  if (['corriente', 'corrientes', 'c'].includes(t)) return 'corriente';
  return null;
}

// ─── Lectura de la hoja ──────────────────────────────────────────────────────

/** Busca la fila de encabezado en las primeras 10 y devuelve dónde está cada columna. */
function ubicarColumnas(filas: unknown[][]): { filaEncabezado: number; indice: Partial<Record<Campo, number>> } | null {
  for (let r = 0; r < Math.min(filas.length, 10); r++) {
    const celdas = (filas[r] ?? []).map((c) => normalizar(textoCelda(crudo(c))));
    const indice: Partial<Record<Campo, number>> = {};
    for (const campo of Object.keys(ALIAS) as Campo[]) {
      const i = celdas.findIndex((c) => ALIAS[campo].includes(c));
      if (i >= 0) indice[campo] = i;
    }
    // La cédula y el nombre son lo mínimo para saber que esta es la fila buena.
    if (indice.cedula !== undefined && indice.nombres !== undefined) return { filaEncabezado: r, indice };
  }
  return null;
}

export interface LecturaEmpleados {
  filas: FilaEmpleado[];
  errores: ErrorFilaEmpleado[];
  avisos: AvisoFilaEmpleado[];
  /** Columnas que el archivo SÍ trae: lo que no venga no se toca al actualizar. */
  columnas: Campo[];
}

/**
 * Convierte las filas crudas de la hoja en filas de empleados. `filas` es la hoja
 * como matriz, fila 0 = fila 1 de Excel. `hoy` ('YYYY-MM-DD') acota las fechas.
 */
export function leerFilasEmpleados(filas: unknown[][], hoy: string): LecturaEmpleados {
  const errores: ErrorFilaEmpleado[] = [];
  const avisos: AvisoFilaEmpleado[] = [];
  const ubicacion = ubicarColumnas(filas);
  if (!ubicacion) {
    return {
      filas: [], avisos, columnas: [],
      errores: [{
        fila: 1, cedula: '',
        mensaje: 'No se encontró la fila de encabezados. El archivo necesita al menos las columnas «Cédula» y «Nombres». Descarga la plantilla para usarla de base.',
      }],
    };
  }

  const { filaEncabezado, indice } = ubicacion;
  const columnas = Object.keys(indice) as Campo[];
  const celda = (fila: unknown[], campo: Campo): unknown => (indice[campo] === undefined ? undefined : fila[indice[campo]!]);
  const texto = (fila: unknown[], campo: Campo) => {
    const t = limpiarTextoCelda(textoCelda(crudo(celda(fila, campo))));
    return t === '' ? undefined : t;
  };

  const resultado: FilaEmpleado[] = [];
  const vistos = new Map<string, number>();
  let leidas = 0;

  for (let r = filaEncabezado + 1; r < filas.length; r++) {
    const fila = filas[r] ?? [];
    const numero = r + 1;

    // Fila en blanco: se salta sin quejarse. Excel deja muchas al final.
    if (columnas.every((c) => textoCelda(crudo(celda(fila, c))) === '')) continue;

    leidas++;
    if (leidas > MAX_FILAS_EMPLEADOS) {
      errores.push({ fila: numero, cedula: '', mensaje: `El archivo pasa de ${MAX_FILAS_EMPLEADOS} empleados. Revisa que sea el archivo correcto o súbelo en partes.` });
      break;
    }

    const err = (cedula: string, mensaje: string) => errores.push({ fila: numero, cedula, mensaje });
    const aviso = (cedula: string, mensaje: string) => avisos.push({ fila: numero, cedula, mensaje });

    const ced = leerCedula(celda(fila, 'cedula'));
    if (ced.error || !ced.cedula) { err('', ced.error ?? 'Falta la cédula.'); continue; }
    const cedula = ced.cedula;
    if (ced.aviso) aviso(cedula, ced.aviso);

    if (vistos.has(cedula)) {
      err(cedula, `La cédula ${cedula} ya aparece en la fila ${vistos.get(cedula)}. Cada empleado va una sola vez.`);
      continue;
    }
    vistos.set(cedula, numero);

    const item: FilaEmpleado = { fila: numero, cedula };
    let malo = false;
    const fallar = (m: string) => { err(cedula, m); malo = true; };

    // Texto libre: cabe en su columna y no es una fórmula en disfraz (se vuelve a escribir en CSV de la TSS y del banco).
    const libre = (campo: Campo, etiqueta: string, destino: 'nombres' | 'apellidos' | 'cargo' | 'afp' | 'ars' | 'banco' | 'telefono') => {
      const t = texto(fila, campo);
      if (t === undefined) return;
      if (t.length > LARGO_MAX[campo]!) { fallar(`${etiqueta} «${t.slice(0, 30)}…» es demasiado largo (máximo ${LARGO_MAX[campo]} caracteres).`); return; }
      if (/^[=+@]/.test(t) || (campo !== 'telefono' && /^-/.test(t))) { fallar(`${etiqueta} «${t.slice(0, 30)}» no puede empezar con = + - @ (parece una fórmula).`); return; }
      item[destino] = t;
    };
    libre('nombres', 'Los nombres', 'nombres');
    libre('apellidos', 'Los apellidos', 'apellidos');
    libre('cargo', 'El cargo', 'cargo');
    libre('afp', 'La AFP', 'afp');
    libre('ars', 'La ARS', 'ars');
    libre('banco', 'El banco', 'banco');
    libre('telefono', 'El teléfono', 'telefono');

    const correo = texto(fila, 'correo');
    if (correo) {
      if (correo.length > LARGO_MAX.correo!) fallar('El correo es demasiado largo.');
      else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)) fallar(`El correo «${correo}» no es válido.`);
      else item.correo = correo.toLowerCase();
    }

    const sal = leerPesos(celda(fila, 'salario'), 'El salario');
    if (sal.error) fallar(sal.error);
    else if (sal.cents !== undefined) {
      if (sal.cents > SALARIO_MAX_CENTS) fallar(`El salario ${(sal.cents / 100).toLocaleString('es-DO')} pasa de RD$10,000,000 al mes: ¿un cero de más?`);
      else {
        item.salarioCents = sal.cents;
        if (sal.cents === 0) aviso(cedula, 'El salario está en cero: la nómina no le pagaría nada.');
        else if (sal.cents < 100_000) aviso(cedula, `El salario es de solo RD$${(sal.cents / 100).toLocaleString('es-DO')} al mes: ¿es mensual?`);
      }
    }

    const inc = leerPesos(celda(fila, 'incentivo'), 'El incentivo');
    if (inc.error) fallar(inc.error);
    else if (inc.cents !== undefined) {
      if (inc.cents > INCENTIVO_MAX_CENTS) fallar('El incentivo pasa de RD$10,000,000: ¿un cero de más?');
      else item.incentivoCents = inc.cents;
    }

    const frec = texto(fila, 'frecuencia');
    if (frec) {
      const f = leerFrecuencia(frec);
      if (!f) fallar(`La frecuencia de pago «${frec}» no existe. Usa Mensual, Quincenal o Semanal.`);
      else item.frecuencia = f;
    }

    const fecha = leerFecha(celda(fila, 'ingreso'), hoy);
    if (fecha.error) fallar(fecha.error);
    else if (fecha.fecha) item.ingreso = fecha.fecha;

    const tipoTexto = texto(fila, 'tipoCuenta');
    if (tipoTexto) {
      const t = leerTipoCuenta(tipoTexto);
      if (!t) fallar(`El tipo de cuenta «${tipoTexto}» no existe. Usa Ahorros o Corriente.`);
      else item.tipoCuenta = t;
    }

    const cuentaTexto = texto(fila, 'cuenta');
    if (cuentaTexto) {
      const c = cuentaTexto.replace(/[\s-]/g, '');
      if (!/^\d{6,30}$/.test(c)) fallar(`La cuenta bancaria «${cuentaTexto}» debe ser solo números (6 a 30 dígitos).`);
      else item.cuenta = c;
    }

    const vac = textoCelda(crudo(celda(fila, 'vacaciones')));
    if (vac !== '') {
      const n = Number(vac);
      if (!Number.isInteger(n) || n < 0 || n > 60) fallar(`Los días de vacaciones «${vac}» deben ser un número entero entre 0 y 60.`);
      else item.vacaciones = n;
    }

    if (malo) continue;
    resultado.push(item);
  }

  return { filas: resultado, errores, avisos, columnas };
}
