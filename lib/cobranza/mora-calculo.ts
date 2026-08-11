/**
 * Cálculo de mora — puro, sin DB.
 *
 * Toda la política de recargo vive aquí para poder probarla de verdad: montos
 * fijos vs porcentaje, cobro periódico, base compuesta y topes. El resto del
 * motor (`nota-debito-mora.ts`, `recargo.ts`) solo lee datos y aplica esto.
 *
 * Unidades: todos los montos en CENTAVOS, todos los porcentajes en BASIS POINTS
 * (200 bps = 2.00%). No se usan floats para dinero en ningún punto.
 */

export type ModoMora = 'porcentaje' | 'fijo';

/** Config efectiva ya resuelta (factura → plan → empresa). */
export interface ConfigMora {
  modo: ModoMora;
  /** Basis points. Solo se usa si modo = 'porcentaje'. */
  porcentajeBps: number;
  /** Centavos. Solo se usa si modo = 'fijo'. */
  montoCents: number;
  /** Días de gracia tras el vencimiento antes del primer cargo. */
  diasGracia: number;
  /** Cada cuántos días se recobra. 0 = una sola vez. */
  periodicidadDias: number;
  /** La base incluye las moras anteriores impagas. */
  compuesta: boolean;
  /** Tope de mora ACUMULADA como % del documento, en bps. 0 = sin tope. */
  topeBps: number;
  /** Máximo de períodos a cobrar. 0 = sin límite. */
  maxPeriodos: number;
}

export interface EntradaMora {
  config: ConfigMora;
  /** Monto total de la factura, en centavos. */
  montoFacturaCents: number;
  /** Saldo pendiente de la factura (ya neto de pagos y notas de crédito). */
  saldoFacturaCents: number;
  /** Suma de las moras ya cobradas que siguen impagas. */
  moraImpagaCents: number;
  /** Suma de TODA la mora cobrada hasta ahora, pagada o no. Para el tope. */
  moraCobradaAcumCents: number;
  /** Cuántas notas de mora existen ya para esta factura. */
  periodosCobrados: number;
  /** Días transcurridos desde fechaLimitePago. Negativo = aún no vence. */
  diasVencido: number;
}

export type ResultadoMora =
  | { aplica: true; montoCents: number; periodo: number; baseCents: number }
  | { aplica: false; razon: RazonNoAplica };

export type RazonNoAplica =
  | 'no_vencida'        // aún dentro del plazo o de la gracia
  | 'sin_saldo'         // no hay nada que recargar
  | 'periodo_ya_cobrado'// el período en curso ya tiene su nota
  | 'max_periodos'      // se alcanzó el límite de períodos
  | 'tope_alcanzado'    // la mora acumulada llegó al tope
  | 'monto_cero';       // el cargo redondea a 0

/**
 * ¿Cuántos períodos de mora corresponden a esta altura?
 *
 * Con periodicidad 0 siempre es 1 (el modelo histórico: un único cargo al
 * vencer). Con periodicidad N, se suma un cargo cada N días a partir de la
 * gracia — el día de la gracia ya cuenta como el primer período.
 */
export function periodosDevengados(diasVencido: number, config: ConfigMora): number {
  const diasEfectivos = diasVencido - config.diasGracia;
  if (diasEfectivos < 0) return 0;
  if (config.periodicidadDias <= 0) return 1;
  return Math.floor(diasEfectivos / config.periodicidadDias) + 1;
}

/**
 * Calcula el cargo del PRÓXIMO período pendiente, si corresponde.
 *
 * Devuelve un solo cargo por llamada: el motor la invoca una vez por corrida y
 * genera a lo sumo una nota. Si una factura estuvo meses sin que corriera el
 * cron, se irá poniendo al día un período por corrida — deliberado, para que
 * una caída del cron no dispare seis cargos de golpe sin que nadie los vea.
 */
export function calcularMora(entrada: EntradaMora): ResultadoMora {
  const { config } = entrada;

  const devengados = periodosDevengados(entrada.diasVencido, config);
  if (devengados <= 0) return { aplica: false, razon: 'no_vencida' };

  if (entrada.periodosCobrados >= devengados) {
    return { aplica: false, razon: 'periodo_ya_cobrado' };
  }

  if (config.maxPeriodos > 0 && entrada.periodosCobrados >= config.maxPeriodos) {
    return { aplica: false, razon: 'max_periodos' };
  }

  // Sin saldo de factura no hay mora, aunque queden moras viejas impagas:
  // recargar una mora ya pagada la factura sería cobrar interés sobre interés
  // sin capital, que no es lo que nadie espera.
  if (entrada.saldoFacturaCents <= 0) return { aplica: false, razon: 'sin_saldo' };

  const baseCents = config.compuesta
    ? entrada.saldoFacturaCents + Math.max(0, entrada.moraImpagaCents)
    : entrada.saldoFacturaCents;

  let montoCents = config.modo === 'fijo'
    ? Math.max(0, Math.trunc(config.montoCents))
    : Math.round((baseCents * config.porcentajeBps) / 10_000);

  // Tope sobre la mora ACUMULADA, no sobre el cargo del período: lo que importa
  // es cuánto llegó a deber el cliente por recargos, no cuánto se le sumó hoy.
  if (config.topeBps > 0) {
    const topeTotal = Math.round((entrada.montoFacturaCents * config.topeBps) / 10_000);
    const margen = topeTotal - entrada.moraCobradaAcumCents;
    if (margen <= 0) return { aplica: false, razon: 'tope_alcanzado' };
    montoCents = Math.min(montoCents, margen);
  }

  if (montoCents <= 0) return { aplica: false, razon: 'monto_cero' };

  return {
    aplica: true,
    montoCents,
    periodo: entrada.periodosCobrados + 1,
    baseCents,
  };
}

/**
 * Fecha de inicio del período N (1-indexado) para una factura vencida.
 * Se usa como clave del índice único (mora_origen_id, mora_periodo), que es lo
 * que impide cobrar dos veces el mismo período aunque el cron corra de más.
 */
export function fechaPeriodo(
  fechaLimitePago: string,
  periodo: number,
  config: ConfigMora,
): string {
  const [y, m, d] = fechaLimitePago.split('-').map(Number);
  const base = new Date(Date.UTC(y, m - 1, d));
  const saltoDias = config.diasGracia
    + (config.periodicidadDias > 0 ? (periodo - 1) * config.periodicidadDias : 0);
  base.setUTCDate(base.getUTCDate() + saltoDias);
  return base.toISOString().slice(0, 10);
}

/** Texto para explicarle al usuario qué mora se le aplicará. Sin DB, reusable en UI. */
export function describirMora(config: ConfigMora, formatearMoneda: (cents: number) => string): string {
  const cargo = config.modo === 'fijo'
    ? formatearMoneda(config.montoCents)
    : `${(config.porcentajeBps / 100).toFixed(2)}%`;

  const cuando = config.diasGracia > 0
    ? `${config.diasGracia} día${config.diasGracia === 1 ? '' : 's'} después del vencimiento`
    : 'al vencer';

  const cada = config.periodicidadDias > 0
    ? `, y se repite cada ${config.periodicidadDias} días mientras siga sin pagarse`
    : '';

  return `${cargo} ${cuando}${cada}.`;
}
