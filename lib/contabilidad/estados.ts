/**
 * Taxonomía de estados de un e-NCF, en lenguaje de contabilidad.
 *
 * Sin imports de servidor a propósito: este módulo lo consume tanto la capa de
 * datos como los componentes de cliente. La regla de oro al escribir aquí es
 * que lo lea una contadora, no un programador: la pregunta que ella se hace es
 * "¿esto lo declaro o no?", así que el veredicto va primero.
 */

export type EstadoNcf =
  | 'ACEPTADO'              // la DGII lo aceptó
  | 'ACEPTADO_CONDICIONAL'  // aceptado con observaciones
  | 'EN_PROCESO'            // enviado, esperando veredicto
  | 'RECHAZADO'             // la DGII lo rechazó
  | 'ANULADO'               // anulado (va en el 608)
  | 'RESERVADO'             // e-NCF tomado, factura aún en borrador
  | 'FALLIDO'               // se intentó, NUNCA llegó a la DGII
  | 'NO_GENERADO'           // número consumido, sin rastro en ninguna fuente
  | 'EN_DGII_SIN_REGISTRO'  // ⚠️ existe en la DGII pero no en este sistema
  | 'ANULADO_DGII'          // rango anulado ante la DGII vía ANECF
  | 'SIN_USAR';             // número aún no consumido

/** Qué debe hacer el contador con este comprobante. Es la decisión que importa. */
export type Veredicto = 'declarar' | 'no-declarar' | 'esperar' | 'revisar';

/** Colores del chip de veredicto (hex directo — la UI es MUI, no utilidades CSS). */
export interface VeredictoMeta {
  label:  string;
  bg:     string;
  fg:     string;
  border: string;
}

export const VEREDICTO_META: Record<Veredicto, VeredictoMeta> = {
  'declarar':    { label: 'Sí se declara', bg: '#d1fae5', fg: '#065f46', border: '#6ee7b7' },
  'no-declarar': { label: 'No se declara', bg: '#f3f4f6', fg: '#374151', border: '#d1d5db' },
  'esperar':     { label: 'Aún no',        bg: '#fef3c7', fg: '#92400e', border: '#fcd34d' },
  'revisar':     { label: 'Revisar',       bg: '#fee2e2', fg: '#991b1b', border: '#fca5a5' },
};

export interface EstadoMeta {
  /** Etiqueta en lenguaje de contabilidad, no técnico. */
  label: string;
  tone: 'ok' | 'warn' | 'error' | 'muted';
  veredicto: Veredicto;
  /** Qué pasó, en español llano. */
  queSignifica: string;
  /** Qué hacer con él. */
  queHacer: string;
}

export const ESTADO_NCF_META: Record<EstadoNcf, EstadoMeta> = {
  ACEPTADO: {
    label: 'Válido', tone: 'ok', veredicto: 'declarar',
    queSignifica: 'La DGII lo recibió y lo aceptó.',
    queHacer: 'Comprobante fiscal válido. Va en el 607.',
  },
  ACEPTADO_CONDICIONAL: {
    label: 'Válido (con observación)', tone: 'ok', veredicto: 'declarar',
    queSignifica: 'La DGII lo aceptó, con una observación menor.',
    queHacer: 'Es válido igual. Va en el 607.',
  },
  EN_PROCESO: {
    label: 'Enviado, esperando DGII', tone: 'warn', veredicto: 'esperar',
    queSignifica: 'Ya se envió a la DGII y estamos esperando su respuesta final.',
    queHacer: 'Normalmente se acepta en minutos. Vuelve a consultar más tarde.',
  },
  RECHAZADO: {
    label: 'Rechazado por la DGII', tone: 'error', veredicto: 'no-declarar',
    queSignifica: 'La DGII revisó el comprobante y lo rechazó.',
    queHacer: 'No es válido y no se declara. La venta debe facturarse de nuevo con otro número.',
  },
  ANULADO: {
    label: 'Anulado', tone: 'muted', veredicto: 'no-declarar',
    queSignifica: 'El comprobante se anuló después de emitirse.',
    queHacer: 'No va en el 607. Se reporta en el formato 608 de anulados.',
  },
  RESERVADO: {
    label: 'Apartado (sin enviar)', tone: 'warn', veredicto: 'esperar',
    queSignifica: 'El número está apartado para una factura que todavía está en borrador.',
    queHacer: 'Todavía no se ha enviado a la DGII. No se declara hasta que se emita.',
  },
  FALLIDO: {
    label: 'No llegó a la DGII', tone: 'error', veredicto: 'no-declarar',
    queSignifica: 'Se intentó emitir pero el envío falló. La DGII nunca lo recibió.',
    queHacer: 'No existe para la DGII. No se declara. La venta se facturó con el número siguiente.',
  },
  NO_GENERADO: {
    label: 'Nunca se usó', tone: 'error', veredicto: 'no-declarar',
    queSignifica: 'El número se apartó pero la factura nunca llegó a crearse (falló antes de enviarse).',
    queHacer: 'No se declara: para la DGII es un número sin usar. Si te preguntan, la respuesta es "intento de emisión fallido, nunca transmitido".',
  },
  EN_DGII_SIN_REGISTRO: {
    label: 'Revisar con soporte', tone: 'error', veredicto: 'revisar',
    queSignifica: 'La DGII tiene este comprobante, pero en el sistema no aparece la factura.',
    queHacer: 'No lo declares todavía. Avisa a soporte para que lo registren correctamente.',
  },
  ANULADO_DGII: {
    label: 'Anulado ante la DGII', tone: 'muted', veredicto: 'no-declarar',
    queSignifica: 'El número se anuló formalmente ante la DGII y ya no puede usarse en una factura.',
    queHacer: 'No se declara. La DGII ya sabe que este número quedó sin usar — no hay que explicarlo.',
  },
  SIN_USAR: {
    label: 'Disponible', tone: 'muted', veredicto: 'no-declarar',
    queSignifica: 'Número todavía sin usar.',
    queHacer: 'No aplica. Se usará en una factura futura.',
  },
};

/**
 * Estados que la DGII permite anular vía ANECF. El criterio es que el número
 * nunca llegó a existir como comprobante fiscal válido: o no se usó, o el
 * intento murió antes de transmitirse, o la DGII lo rechazó (en cuyo caso el
 * número queda quemado y la venta se refacturó con el siguiente).
 *
 * Un ACEPTADO / ACEPTADO_CONDICIONAL / EN_PROCESO NO entra aquí — esos existen
 * ante la DGII y solo se revierten con Nota de Crédito (tipo 34).
 */
export const ESTADOS_ANULABLES_ANECF: EstadoNcf[] = [
  'SIN_USAR', 'NO_GENERADO', 'FALLIDO', 'RECHAZADO',
];

/**
 * Por qué un estado bloquea la anulación del tramo completo. El texto se
 * muestra tal cual al usuario, así que explica la salida, no solo el problema.
 */
export const MOTIVO_BLOQUEO_ANECF: Partial<Record<EstadoNcf, string>> = {
  ACEPTADO:             'La DGII lo aceptó: es un comprobante fiscal válido. Para revertirlo hay que emitir una Nota de Crédito (tipo 34), no un ANECF.',
  ACEPTADO_CONDICIONAL: 'La DGII lo aceptó con observación: sigue siendo válido. Para revertirlo hay que emitir una Nota de Crédito (tipo 34).',
  EN_PROCESO:           'Está enviado y esperando el veredicto de la DGII. Espera a que resuelva antes de anular el tramo.',
  ANULADO:              'Ya se anuló como comprobante emitido (va en el 608). No se vuelve a anular por rango.',
  ANULADO_DGII:         'Este número ya se anuló ante la DGII en un envío anterior.',
  RESERVADO:            'Hay una factura en borrador usando este número. Anula o emite ese borrador primero — si anulas el rango, el borrador queda con un e-NCF inválido.',
  EN_DGII_SIN_REGISTRO: 'La DGII tiene un comprobante con este número pero el sistema no. Revísalo con soporte antes de anular.',
};

/** Estados que representan un problema — alimentan el filtro "solo con problemas". */
export const ESTADOS_ERROR: EstadoNcf[] = ['RECHAZADO', 'FALLIDO', 'NO_GENERADO', 'EN_DGII_SIN_REGISTRO'];

/** Estados con valor fiscal (llegaron a la DGII y cuentan). */
export const ESTADOS_FISCALES: EstadoNcf[] = ['ACEPTADO', 'ACEPTADO_CONDICIONAL', 'EN_PROCESO'];
