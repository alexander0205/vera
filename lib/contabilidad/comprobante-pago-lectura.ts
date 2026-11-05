/**
 * Lo que dice el comprobante de la transferencia con la que se paga a un
 * proveedor, ya limpio, y qué se hace con ello. Puro, sin base ni red: lo usan
 * el lector con IA (servidor), la pantalla de pago y las pruebas.
 *
 * La IA propone, la persona decide. Nada de aquí registra un pago ni un asiento:
 * solo prepara fecha, monto y referencia para que quien paga los confirme con el
 * papel al lado, y avisa cuando lo leído no coincide con lo que se va a pagar.
 */

import { fechaValidaISO } from '@/lib/utils/format';

/** Lo que se guarda de la lectura (jsonb) y se enseña en pantalla. */
export interface LecturaPagoIa {
  esComprobante: boolean;
  /** Lo transferido al proveedor, en centavos. */
  montoCentavos: number | null;
  /** El impuesto o cargo que el banco cobra aparte, en centavos (cargo bancario). */
  impuestoCentavos: number | null;
  fecha: string | null;
  /** El número de referencia de la operación. */
  referencia: string | null;
  /** El id de la transacción en el banco. */
  idTransaccion: string | null;
  bancoOrigen: string | null;
  beneficiario: string | null;
  confianza: number;
  modelo: string;
}

/** Tope de un monto creíble: mil millones de pesos, en centavos. Más es una lectura rota. */
const MAX_CENTAVOS = 100_000_000_000;

function texto(v: unknown, max: number): string | null {
  if (typeof v !== 'string') return null;
  const t = v.replace(/\s+/g, ' ').trim().slice(0, max);
  return t === '' ? null : t;
}

function centavos(pesos: unknown): number | null {
  if (typeof pesos !== 'number' || !Number.isFinite(pesos) || pesos <= 0) return null;
  const c = Math.round(pesos * 100);
  return c <= MAX_CENTAVOS ? c : null;
}

/**
 * Lo que devolvió el modelo, saneado. Un campo con otro tipo, un monto negativo
 * o una fecha que no existe se vuelven `null` en vez de colarse hasta la
 * pantalla de quien paga. Los montos llegan en PESOS, como los imprime el papel.
 */
export function limpiarLecturaPago(salida: unknown, modelo: string): LecturaPagoIa {
  const s = (salida && typeof salida === 'object' ? salida : {}) as Record<string, unknown>;
  const confianza = typeof s.confianza === 'number' && Number.isFinite(s.confianza)
    ? Math.min(1, Math.max(0, s.confianza))
    : 0;

  if (s.esComprobante === false) {
    // Una foto cualquiera no tiene monto ni referencia: lo que el modelo «leyó» ahí es ruido.
    return {
      esComprobante: false, montoCentavos: null, impuestoCentavos: null, fecha: null,
      referencia: null, idTransaccion: null, bancoOrigen: null, beneficiario: null, confianza, modelo,
    };
  }

  return {
    esComprobante: true,
    montoCentavos: centavos(s.monto),
    impuestoCentavos: centavos(s.impuesto),
    fecha: fechaValidaISO(texto(s.fecha, 10)) ?? null,
    referencia: texto(s.referencia, 100),
    idTransaccion: texto(s.idTransaccion, 100),
    bancoOrigen: texto(s.bancoOrigen, 120),
    beneficiario: texto(s.beneficiario, 120),
    confianza,
    modelo,
  };
}

/** Lo que se le propone a quien paga: se rellena el formulario y él confirma. */
export interface PropuestaPago {
  /** Pesos con dos decimales, listo para el campo de monto; null si no se leyó. */
  montoDOP: string | null;
  fecha: string | null;
  /** La referencia que se guarda en el pago: la de la operación, y si no, el id de la transacción. */
  referencia: string | null;
}

export function proponerDesdeLectura(l: LecturaPagoIa | null | undefined): PropuestaPago {
  if (!l || !l.esComprobante) return { montoDOP: null, fecha: null, referencia: null };
  return {
    montoDOP: l.montoCentavos != null ? (l.montoCentavos / 100).toFixed(2) : null,
    fecha: l.fecha,
    referencia: l.referencia ?? l.idTransaccion,
  };
}

const pesos = (c: number) => `RD$${(c / 100).toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Días de diferencia entre dos fechas 'YYYY-MM-DD' (valor absoluto). */
function diasEntre(a: string, b: string): number {
  return Math.abs(Math.round((Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86_400_000));
}

/** Margen en días entre la fecha del comprobante y la del pago antes de avisar. */
export const DIAS_TOLERANCIA_FECHA = 3;
/** Por debajo de esto la lectura se avisa como dudosa. */
export const CONFIANZA_MINIMA = 0.5;

/**
 * Lo que hay que decirle a quien paga cuando lo leído no coincide con lo que
 * escribió. Vacío = todo cuadra. `pago` es lo que se va a registrar.
 */
export function avisosLecturaPago(
  l: LecturaPagoIa | null | undefined,
  pago: { montoCents: number; fecha: string },
): string[] {
  if (!l) return [];
  if (!l.esComprobante) return ['El archivo no parece un comprobante de transferencia o pago bancario. Revísalo antes de adjuntarlo.'];
  const avisos: string[] = [];
  if (l.montoCentavos != null && l.montoCentavos !== pago.montoCents) {
    avisos.push(`El comprobante dice ${pesos(l.montoCentavos)} y el pago es de ${pesos(pago.montoCents)}.`);
  }
  if (l.fecha && diasEntre(l.fecha, pago.fecha) > DIAS_TOLERANCIA_FECHA) {
    avisos.push(`El comprobante es del ${l.fecha} y el pago lleva fecha ${pago.fecha}.`);
  }
  if (l.impuestoCentavos != null) {
    avisos.push(`El banco cobró ${pesos(l.impuestoCentavos)} de impuesto aparte: regístralo como cargo bancario en Bancos y caja, no como parte del pago al proveedor.`);
  }
  if (l.confianza < CONFIANZA_MINIMA) avisos.push('La lectura es dudosa (imagen borrosa o cortada): confirma los datos con el papel.');
  return avisos;
}
