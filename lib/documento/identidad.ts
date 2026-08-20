/**
 * Documento de identidad tributaria: RNC, cédula o pasaporte.
 *
 * Fuente única para el selector de tipo que va delante del campo en todos los
 * formularios (cliente, proveedor, vendedor, tutor, empresa, personal). El
 * usuario elige PRIMERO qué va a escribir y así el campo sabe qué placeholder,
 * qué teclado y qué validación aplicar — se acabó el «tecleé 9 dígitos de una
 * cédula y el sistema lo tomó por RNC».
 *
 * El tipo NO se guarda en la base: se DEDUCE del valor con `inferirTipo`. Es
 * decisión de producto — no vale la pena una migración multi-tabla cuando el
 * formato ya distingue los tres sin ambigüedad (9 díg = RNC, 11 = cédula, con
 * letras = pasaporte). El selector es ayuda de captura, no un dato nuevo.
 */

export type TipoDocumento = 'rnc' | 'cedula' | 'pasaporte';

export const TIPOS_DOCUMENTO: ReadonlyArray<{ value: TipoDocumento; label: string }> = [
  { value: 'rnc',       label: 'RNC' },
  { value: 'cedula',    label: 'Cédula' },
  { value: 'pasaporte', label: 'Pasaporte' },
] as const;

/** Quita guiones y espacios; el pasaporte además va en mayúsculas. */
export function normalizarDocumento(v: string | null | undefined): string {
  return (v ?? '').replace(/[-\s]/g, '').toUpperCase();
}

/**
 * Deduce el tipo a partir del valor guardado (para arrancar el selector al
 * editar). Sin letras: 11 díg → cédula, si no RNC. Con letras → pasaporte.
 * Vacío → RNC, que es el caso más común al crear una empresa/proveedor.
 */
export function inferirTipo(v: string | null | undefined): TipoDocumento {
  const s = normalizarDocumento(v);
  if (s === '') return 'rnc';
  if (/[A-Z]/.test(s)) return 'pasaporte';
  if (s.length === 11) return 'cedula';
  if (s.length === 9)  return 'rnc';
  // Dígitos de largo no estándar (a medio teclear): el tipo más largo que
  // encaje, para no saltar de RNC a cédula con cada dígito.
  return s.length > 9 ? 'cedula' : 'rnc';
}

/**
 * ¿Lo tecleado apunta a un tipo distinto del elegido? Devuelve el tipo que
 * SUGERIR (no se cambia solo: se ofrece «¿cambiar el selector?»). `null` si lo
 * tecleado encaja con el tipo actual o es aún ambiguo.
 *
 * La diferencia RNC/cédula es la longitud: RNC = 9 dígitos, cédula = 11; nunca
 * se solapan. Se sugiere solo ante señales confiables (longitud terminal), para
 * no molestar a media palabra:
 *   · con letras (≥5 car.) → pasaporte (RNC/cédula son solo dígitos);
 *   · 11 dígitos → cédula (un RNC nunca llega a 11);
 *   · 9 dígitos → RNC (una cédula nunca se queda en 9). Dispara solo en el 9º
 *     exacto —no en 8 ni 10—, así que tecleando una cédula apenas asoma un
 *     instante y sirve para atrapar «RNC completo con Cédula puesta».
 */
export function tipoSugerido(
  actual: TipoDocumento, value: string | null | undefined,
): TipoDocumento | null {
  const s = normalizarDocumento(value);
  if (s.length < 5) return null;
  let suger: TipoDocumento | null = null;
  if (/[A-Z]/.test(s)) suger = 'pasaporte';
  else if (s.length === 11) suger = 'cedula';
  else if (s.length === 9) suger = 'rnc';
  if (!suger || suger === actual) return null;
  return suger;
}

/** Etiqueta legible del tipo (para textos de sugerencia). */
export function etiquetaTipo(tipo: TipoDocumento): string {
  return TIPOS_DOCUMENTO.find((t) => t.value === tipo)?.label ?? tipo;
}

export const PLACEHOLDER_DOCUMENTO: Record<TipoDocumento, string> = {
  rnc:       '131793916',
  cedula:    '001-0000000-0',
  pasaporte: 'A1234567',
};

/** Máximo de caracteres del campo (cédula cuenta los dos guiones). */
export const MAXLEN_DOCUMENTO: Record<TipoDocumento, number> = {
  rnc:       9,
  cedula:    13,
  pasaporte: 20,
};

/** Teclado del móvil: numérico para RNC/cédula, texto para pasaporte. */
export const INPUTMODE_DOCUMENTO: Record<TipoDocumento, 'numeric' | 'text'> = {
  rnc:       'numeric',
  cedula:    'numeric',
  pasaporte: 'text',
};

/** El padrón (DGII/OGTIC) solo cubre RNC y cédula; el pasaporte se teclea. */
export function tienePadron(tipo: TipoDocumento): boolean {
  return tipo === 'rnc' || tipo === 'cedula';
}

/**
 * Limpia lo tecleado según el tipo mientras se escribe: RNC/cédula solo
 * dígitos (la cédula además se formatea 000-0000000-0), pasaporte alfanumérico
 * en mayúsculas. Devuelve el valor listo para guardar/mostrar.
 */
export function formatearMientrasEscribe(tipo: TipoDocumento, raw: string): string {
  if (tipo === 'pasaporte') {
    return raw.replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 20);
  }
  const digitos = raw.replace(/\D/g, '');
  // RNC son 9, pero se permiten hasta 11 SIN cortar en el 9º: así, si el usuario
  // teclea una cédula con «RNC» elegido, los 11 dígitos entran y se puede
  // sugerir el cambio de tipo en vez de tragarse los dos últimos en silencio.
  if (tipo === 'rnc') return digitos.slice(0, 11);
  // Cédula: 000-0000000-0
  const d = digitos.slice(0, 11);
  if (d.length <= 3) return d;
  if (d.length <= 10) return `${d.slice(0, 3)}-${d.slice(3)}`;
  return `${d.slice(0, 3)}-${d.slice(3, 10)}-${d.slice(10)}`;
}

/**
 * Valida el valor contra el tipo elegido. Vacío = válido (el campo suele ser
 * opcional; la obligatoriedad la decide cada formulario). Devuelve el mensaje
 * de error o `null` si está bien.
 */
export function validarDocumento(tipo: TipoDocumento, v: string | null | undefined): string | null {
  const s = normalizarDocumento(v);
  if (s === '') return null;
  if (tipo === 'rnc') {
    return /^\d{9}$/.test(s) ? null : 'El RNC debe tener 9 dígitos';
  }
  if (tipo === 'cedula') {
    return /^\d{11}$/.test(s) ? null : 'La cédula debe tener 11 dígitos';
  }
  // Pasaporte: 5-20 alfanuméricos con al menos una letra y un número.
  return /^(?=[A-Z0-9]*[A-Z])(?=[A-Z0-9]*[0-9])[A-Z0-9]{5,20}$/.test(s)
    ? null
    : 'Pasaporte inválido (5-20 caracteres, letras y números)';
}
