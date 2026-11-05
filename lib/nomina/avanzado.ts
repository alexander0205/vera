/**
 * Valores «Avanzado» de la nómina: los pocos números que pueden variar por empresa
 * (o que el contable puede querer ajustar) y que antes estaban fijos en el código.
 * Funciones puras, sin BD; la lectura y el guardado viven en `./avanzado-db`.
 *
 * NO están aquí las tasas de la TSS ni la escala del ISR: esas son de ley y se
 * actualizan por año en `lib/config/nomina-tasas.ts`.
 *
 * Sin configuración, cada valor es EXACTAMENTE lo que hacía el código antes.
 */

export type MetodoFaltas = 'calendario' | 'laborable';
export type BaseRegalia = 'todo' | 'ordinario';

export interface AvanzadoNomina {
  /** Salario mensual ÷ este número = salario diario para prestaciones (vacaciones, cesantía, preaviso). */
  divisorSalarioDiario: number;
  /**
   * Cómo se descuenta una falta: 'calendario' = el sueldo del mes ÷ los días del mes (lo de siempre);
   * 'laborable' = el salario diario con el divisor de arriba.
   */
  metodoFaltas: MetodoFaltas;
  /** Qué suma a la base de la regalía: todo lo devengado, o solo el salario ordinario (sin ingresos variables). */
  regaliaBase: BaseRegalia;
  /** Días de vacaciones al año (de 1 a 5 años de servicio). */
  diasVacaciones: number;
  /** Días de vacaciones al año desde los 5 años de servicio. */
  diasVacacionesMas5Anios: number;
  /** Días de cesantía por año que se provisionan (estimación contable). */
  diasCesantiaProvision: number;
}

export const AVANZADO_DEFAULT: Readonly<AvanzadoNomina> = {
  divisorSalarioDiario: 23.83,
  metodoFaltas: 'calendario',
  regaliaBase: 'todo',
  diasVacaciones: 14,
  diasVacacionesMas5Anios: 18,
  diasCesantiaProvision: 21,
};

export const AVANZADO_RANGOS = {
  // Solo hacia lo que da la ley o más al empleado: un divisor mayor a 23.83 le pagaría menos.
  divisorSalarioDiario: { min: 20, max: 23.83 },
  // Mínimos de ley (art. 177): 14 días, y 18 desde los 5 años.
  diasVacaciones: { min: 14, max: 60 },
  diasVacacionesMas5Anios: { min: 18, max: 60 },
  diasCesantiaProvision: { min: 1, max: 60 },
} as const;

type ClaveNumerica = keyof typeof AVANZADO_RANGOS;
const CLAVES_NUMERICAS = Object.keys(AVANZADO_RANGOS) as ClaveNumerica[];

export const ETIQUETA_AVANZADO: Record<keyof AvanzadoNomina, string> = {
  divisorSalarioDiario: 'Divisor del salario diario',
  metodoFaltas: 'Cómo se descuentan las faltas',
  regaliaBase: 'Base de la regalía',
  diasVacaciones: 'Días de vacaciones al año',
  diasVacacionesMas5Anios: 'Días de vacaciones desde 5 años',
  diasCesantiaProvision: 'Días de cesantía por año (provisión)',
};

export type ValidacionAvanzado =
  | { ok: true; valores: AvanzadoNomina }
  | { ok: false; errores: string[] };

/**
 * Valida lo que escribe una persona. Los campos que no vienen quedan en su valor de ley.
 * Un valor fuera de rango, o de otro tipo, es un error: no se corrige a escondidas.
 */
export function validarAvanzado(entrada: unknown): ValidacionAvanzado {
  if (!entrada || typeof entrada !== 'object' || Array.isArray(entrada)) return { ok: false, errores: ['Cuerpo inválido'] };
  const e = entrada as Record<string, unknown>;
  const valores: AvanzadoNomina = { ...AVANZADO_DEFAULT };
  const errores: string[] = [];

  for (const k of CLAVES_NUMERICAS) {
    if (!(k in e) || e[k] === null || e[k] === '') continue;
    const { min, max } = AVANZADO_RANGOS[k];
    const n = typeof e[k] === 'number' ? (e[k] as number) : typeof e[k] === 'string' ? Number((e[k] as string).replace(',', '.')) : NaN;
    if (!Number.isFinite(n) || n < min || n > max) {
      errores.push(`${ETIQUETA_AVANZADO[k]} debe ser un número entre ${min} y ${max}`);
      continue;
    }
    valores[k] = Math.round(n * 100) / 100;
  }
  if ('metodoFaltas' in e && e.metodoFaltas != null) {
    if (e.metodoFaltas === 'calendario' || e.metodoFaltas === 'laborable') valores.metodoFaltas = e.metodoFaltas;
    else errores.push(`${ETIQUETA_AVANZADO.metodoFaltas}: elige «calendario» o «laborable»`);
  }
  if ('regaliaBase' in e && e.regaliaBase != null) {
    if (e.regaliaBase === 'todo' || e.regaliaBase === 'ordinario') valores.regaliaBase = e.regaliaBase;
    else errores.push(`${ETIQUETA_AVANZADO.regaliaBase}: elige «todo» u «ordinario»`);
  }
  return errores.length > 0 ? { ok: false, errores } : { ok: true, valores };
}

/**
 * Lo guardado (jsonb) → valores completos. Tolerante: cualquier cosa que falte o sea inválida
 * vuelve a su valor de ley, para que una fila dañada nunca rompa una corrida.
 */
export function completarAvanzado(guardado: unknown): AvanzadoNomina {
  if (!guardado || typeof guardado !== 'object' || Array.isArray(guardado)) return { ...AVANZADO_DEFAULT };
  const g = guardado as Record<string, unknown>;
  const limpio: Record<string, unknown> = {};
  for (const k of Object.keys(AVANZADO_DEFAULT)) {
    const un = validarAvanzado({ [k]: g[k] });
    if (un.ok && g[k] != null) limpio[k] = un.valores[k as keyof AvanzadoNomina];
  }
  return { ...AVANZADO_DEFAULT, ...limpio } as AvanzadoNomina;
}

/** Salarios mínimos del sector que quedan exentos de ISR en la regalía: regla de la DGII, no de la empresa. */
export const REGALIA_TOPE_EXENTO_SALARIOS = 5;

/** Tope exento de ISR de la regalía, en centavos (null = no se conoce el salario mínimo del sector). */
export const topeRegaliaCents = (pisoCotizableCents: number | null | undefined): number | null =>
  pisoCotizableCents ? REGALIA_TOPE_EXENTO_SALARIOS * pisoCotizableCents : null;

/**
 * Cuánto cuesta una falta, en centavos, para un sueldo mensual dado en un mes de `diasDelMes`:
 * calendario = sueldo ÷ días del mes; laborable = sueldo ÷ divisor. Sirve de ejemplo en pantalla.
 */
export function costoDeUnaFaltaCents(salarioMensualCents: number, diasDelMes: number, av: Pick<AvanzadoNomina, 'metodoFaltas' | 'divisorSalarioDiario'>): number {
  return Math.round(salarioMensualCents / (av.metodoFaltas === 'laborable' ? av.divisorSalarioDiario : diasDelMes));
}
