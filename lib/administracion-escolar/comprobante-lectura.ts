/**
 * Qué se hace con lo que la IA leyó de un comprobante: limpiarlo, compararlo con
 * lo que dijo el padre y decidir si es una repetición. Pura, sin base ni red: la
 * usan el lector (servidor), el listado, la pantalla de aprobar y las pruebas.
 *
 * La IA propone y la persona decide. Nada de aquí aprueba, rechaza ni mueve un
 * peso: solo prepara lo que el revisor va a mirar con el papel al lado.
 */

import { fechaValidaISO } from '@/lib/utils/format';
import { normalizarBanco } from '@/lib/pagos/bancos';
import type { LecturaComprobanteIa } from '@/lib/db/schema';

export type { LecturaComprobanteIa };

// ── Limpiar lo que devuelve el modelo ───────────────────────────────────────

/** Un texto recortado, o null si quedó vacío. */
function texto(v: unknown, max: number): string | null {
  if (typeof v !== 'string') return null;
  const t = v.replace(/\s+/g, ' ').trim().slice(0, max);
  return t === '' ? null : t;
}

/** Los últimos 4 dígitos de lo que venga («****4821», «0012-4821»). */
function cuatroFinales(v: unknown): string | null {
  const digitos = typeof v === 'string' || typeof v === 'number' ? String(v).replace(/\D/g, '') : '';
  return digitos.length >= 4 ? digitos.slice(-4) : null;
}

/**
 * Un banco como se le enseña al usuario: el nombre de nuestra lista si se
 * reconoce («BHD León» → «Banco BHD»), y si no el texto tal cual lo leyó.
 */
function nombreDeBanco(v: unknown): string | null {
  const crudo = texto(v, 120);
  if (!crudo) return null;
  return normalizarBanco(crudo)?.nombre ?? crudo;
}

/** El tope de un monto creíble: mil millones de pesos, en centavos. Más es una lectura rota. */
const MAX_CENTAVOS = 100_000_000_000;

/**
 * Lo que dijo el modelo, saneado. Se desconfía de todo: un campo que viene con
 * otro tipo, un monto negativo o una fecha que no existe se vuelven `null` en
 * vez de colarse hasta la pantalla de un revisor que confía en lo que ve.
 *
 * `monto` llega en PESOS, como lo imprime el papel.
 */
export function limpiarLectura(salida: unknown, modelo: string): LecturaComprobanteIa {
  const s = (salida && typeof salida === 'object' ? salida : {}) as Record<string, unknown>;

  const pesos = typeof s.monto === 'number' ? s.monto : Number.NaN;
  const centavos = Number.isFinite(pesos) && pesos > 0 ? Math.round(pesos * 100) : null;

  const confianza = typeof s.confianza === 'number' && Number.isFinite(s.confianza)
    ? Math.min(1, Math.max(0, s.confianza))
    : 0;

  const esComprobante = s.esComprobante !== false;
  if (!esComprobante) {
    // Una captura de WhatsApp o una foto del patio no tiene banco ni monto: lo
    // que el modelo haya «leído» ahí es ruido, y se descarta entero.
    return {
      esComprobante: false, bancoDestino: null, bancoOrigen: null, cuentaDestinoUltimos4: null,
      montoCentavos: null, fecha: null, referencia: null, ordenante: null, beneficiario: null,
      confianza, modelo,
    };
  }

  return {
    esComprobante: true,
    bancoDestino: nombreDeBanco(s.bancoDestino),
    bancoOrigen: nombreDeBanco(s.bancoOrigen),
    cuentaDestinoUltimos4: cuatroFinales(s.cuentaDestino),
    montoCentavos: centavos != null && centavos <= MAX_CENTAVOS ? centavos : null,
    fecha: fechaValidaISO(texto(s.fecha, 10)) ?? null,
    referencia: texto(s.referencia, 120),
    ordenante: texto(s.ordenante, 120),
    beneficiario: texto(s.beneficiario, 120),
    confianza,
    modelo,
  };
}

// ── Comparar montos ─────────────────────────────────────────────────────────

export type ComparacionMonto =
  | { estado: 'sin_lectura' }
  | { estado: 'coincide' }
  /** `diferenciaCentavos` = lo que dice el papel menos lo que se va a registrar. */
  | { estado: 'difiere'; diferenciaCentavos: number };

/**
 * ¿El monto que la IA leyó en el papel es el que se va a registrar?
 *
 * Al centavo: un banco imprime el importe exacto, así que cualquier diferencia
 * es una lectura mala o una transferencia por otro valor — y las dos cosas las
 * tiene que ver una persona antes de pulsar «Registrar».
 */
export function compararMonto(
  leidoCentavos: number | null | undefined,
  aRegistrarCentavos: number | null | undefined,
): ComparacionMonto {
  if (leidoCentavos == null || aRegistrarCentavos == null) return { estado: 'sin_lectura' };
  const d = leidoCentavos - aRegistrarCentavos;
  return d === 0 ? { estado: 'coincide' } : { estado: 'difiere', diferenciaCentavos: d };
}

// ── Duplicados ──────────────────────────────────────────────────────────────

/**
 * La referencia comparable de un comprobante: mayúsculas y solo letras y
 * números («ref: 84-22 91A» y «8422 91a» son la misma). Menos de cinco
 * caracteres no identifica nada («1234» la tiene medio país), así que no cuenta.
 */
export function claveReferencia(ref: string | null | undefined): string | null {
  const k = (ref ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  return k.length >= 5 ? k : null;
}

/** Lo que hace falta de un comprobante para saber si repite a otro. */
export interface ParaDuplicado {
  id: number;
  estado: string;
  /** La familia. Sin ella no se puede decir «del mismo cliente». */
  clientId: number | null;
  creadoEn: Date | string;
  /** sha256 del archivo subido. */
  archivoHash: string | null;
  /** Lo que la IA leyó; nunca lo que tecleó el padre (ver `detectarDuplicado`). */
  lectura: Pick<LecturaComprobanteIa, 'referencia' | 'montoCentavos' | 'fecha'> | null;
}

export type MotivoDuplicado = 'archivo' | 'referencia' | 'monto_fecha';

export interface Duplicado {
  id: number;
  estado: string;
  creadoEn: string;
  motivo: MotivoDuplicado;
}

const ORDEN_MOTIVO: Record<MotivoDuplicado, number> = { archivo: 0, referencia: 1, monto_fecha: 2 };

function motivoDeRepeticion(a: ParaDuplicado, b: ParaDuplicado): MotivoDuplicado | null {
  // El mismo archivo, byte por byte: la misma foto subida otra vez.
  if (a.archivoHash && a.archivoHash === b.archivoHash) return 'archivo';

  // La misma operación del banco, aunque la foto sea otra captura.
  const ra = claveReferencia(a.lectura?.referencia);
  if (ra && ra === claveReferencia(b.lectura?.referencia)) return 'referencia';

  // Mismo importe el mismo día: no prueba nada por sí solo —dos hermanos pagan
  // la misma mensualidad—, pero es lo que queda cuando el papel no trae
  // referencia legible, y es justo cuando conviene mirar dos veces.
  const la = a.lectura, lb = b.lectura;
  if (la?.montoCentavos != null && la.fecha && la.montoCentavos === lb?.montoCentavos && la.fecha === lb?.fecha) {
    return 'monto_fecha';
  }
  return null;
}

/**
 * ¿Este comprobante parece repetir otro de la misma familia?
 *
 * Se compara contra los que NO se rechazaron: uno rechazado nunca movió dinero,
 * y que la familia lo vuelva a subir corregido es lo que se le pidió. Pasa por
 * cualquiera de tres señales, de más a menos firme: el mismo archivo, la misma
 * referencia leída, o el mismo monto con la misma fecha.
 *
 * La referencia que se compara es la que LEYÓ la IA, no la que figura en la fila:
 * esa, si el padre no escribe otra, es la del enlace de pago, que es la misma
 * para todos los comprobantes de la familia y los marcaría a todos.
 *
 * Si encajan varios, se devuelve el de señal más firme y, a igualdad, el más
 * viejo (el original, no la copia). No bloquea nada: avisa.
 */
export function detectarDuplicado(actual: ParaDuplicado, otros: readonly ParaDuplicado[]): Duplicado | null {
  if (actual.clientId == null) return null;

  let mejor: Duplicado | null = null;
  for (const o of otros) {
    if (o.id === actual.id || o.estado === 'rechazado' || o.clientId !== actual.clientId) continue;
    const motivo = motivoDeRepeticion(actual, o);
    if (!motivo) continue;
    if (
      !mejor
      || ORDEN_MOTIVO[motivo] < ORDEN_MOTIVO[mejor.motivo]
      || (motivo === mejor.motivo && o.id < mejor.id)
    ) {
      mejor = {
        id: o.id,
        estado: o.estado,
        creadoEn: o.creadoEn instanceof Date ? o.creadoEn.toISOString() : o.creadoEn,
        motivo,
      };
    }
  }
  return mejor;
}

/** Cómo se le cuenta al revisor por qué se marcó. */
export function textoMotivoDuplicado(m: MotivoDuplicado): string {
  switch (m) {
    case 'archivo': return 'es exactamente el mismo archivo';
    case 'referencia': return 'trae la misma referencia del banco';
    case 'monto_fecha': return 'tiene el mismo monto y la misma fecha';
  }
}
