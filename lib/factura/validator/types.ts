/**
 * Types for the e-CF schema-driven validator.
 *
 * The DGII publishes 10 tipos de comprobante:
 *   31, 32, 33, 34, 41, 43, 44, 45, 46, 47.
 *
 * For each tipo, every field has an `obligatoriedad` that tells us whether it
 * must be present, may be present, must not be present, or is required under
 * a documented condition.
 */

export type Obligatoriedad =
  | 'REQUIRED'
  | 'CONDITIONAL'
  | 'OPTIONAL'
  | 'FORBIDDEN';

/**
 * `BOOL` and `DECIMAL` are accepted for forward compatibility — the raw
 * schemas use NUM/ALFANUM/ALFA/FECHA today, but downstream code may want a
 * stricter logical typing.  Unknown raw `tipo` values fall back to `ALFANUM`.
 */
export type CampoTipo =
  | 'NUM'
  | 'ALFANUM'
  | 'ALFA'
  | 'FECHA'
  | 'BOOL'
  | 'DECIMAL';

export interface CampoSchema {
  /** DGII reference number from the norma (column "#"). Not unique across sections. */
  dgiiNo: number;
  /** Human-readable name in Spanish, as published by DGII. */
  nombre: string;
  /** XML tag in the e-CF document (with angle brackets). */
  xmlTag: string;
  /**
   * Dotted path inside the payload object the form/API uses.
   * Item-level fields are namespaced with `items[].` — e.g. `items[].montoItem`.
   */
  payloadKey: string;
  /** Raw type as published by DGII. */
  tipo: CampoTipo;
  /** Max length in characters or digits. Absent for some computed fields. */
  maxLength?: number;
  /** Whether the field is REQUIRED, CONDITIONAL, OPTIONAL, or FORBIDDEN for this tipo. */
  obligatoriedad: Obligatoriedad;
  /** Numeric obligatoriedad code: 0=FORBIDDEN, 1=REQUIRED, 2=CONDITIONAL, 3=OPTIONAL. */
  obligatoriedadCodigo?: number;
  /** Optional plain-text description of the condition (Spanish). */
  condicion?: string;
  /** Allowed values for enum fields. */
  valoresValidos?: (string | number)[];
  /** Top-level section the field belongs to (IdDoc, Comprador, Totales, Items, etc.). */
  seccion: string;
}

export interface TipoSchemaResumen {
  total: number;
  required: number;
  conditional: number;
  optional: number;
  forbidden: number;
}

export interface TipoSchema {
  /** Two-digit tipo de comprobante (string to preserve the leading character). */
  tipo: string;
  /** Human-readable name, e.g. "Factura de Crédito Fiscal Electrónica". */
  nombre: string;
  /** Counts by obligatoriedad. */
  resumen?: TipoSchemaResumen;
  /** Every field defined for this tipo, irrespective of obligatoriedad. */
  campos: CampoSchema[];
}

export type ValidationRule =
  | 'REQUIRED_MISSING'
  | 'CONDITIONAL_MISSING'
  | 'FORBIDDEN_PRESENT'
  | 'INVALID_TYPE'
  | 'MAX_LENGTH'
  | 'INVALID_ENUM'
  | 'INVALID_DATE_FORMAT';

export interface ValidationError {
  payloadKey: string;
  /** When the offending field is inside `items[]`, this is the item index (0-based). */
  itemIndex?: number;
  nombre: string;
  seccion: string;
  rule: ValidationRule;
  message: string;
  value?: unknown;
}

export interface ValidationResult {
  ok: boolean;
  errors: ValidationError[];
  /**
   * Soft issues — currently unused, but reserved for future rules where we want
   * to advise without blocking submission.
   */
  warnings: ValidationError[];
}

/**
 * Form/runtime state used to evaluate conditional rules.
 * All fields are optional — when omitted, the rule that depends on them is
 * assumed inactive (i.e. we will not raise CONDITIONAL_MISSING).
 *
 * Extend this interface as new rules are discovered.
 */
export interface ValidationContext {
  /** 1 = Contado, 2 = Crédito, 3 = Gratuito. Drives `fechaLimitePago`. */
  tipoPago?: number;
  /** Presence indicates a modification reference; drives `fechaNCFModificado` and `codigoModificacion`. */
  ncfModificado?: string;
  /** Drives item-level totals & the `identificadorExtranjero` 250k threshold for tipo 32. */
  montoTotal?: number;
  /** Used to detect "all amounts are exempt" scenarios. */
  montoExento?: number;
  /** Empty/null triggers the alternate identifier rules. */
  rncComprador?: string;
  /** True when at least one item has ITBIS gravado — drives `indicadorMontoGravado`. */
  hasItbisItems?: boolean;
  /** True when at least one item has ISR retenido — drives `totalISRRetencion`. */
  hasIsrRetencion?: boolean;
  /** True when any item is non-billable — drives `montoNoFacturable`. */
  hasMontoNoFacturable?: boolean;
}

export interface ValidateOptions {
  context?: ValidationContext;
  /** When true, warnings are appended to `errors` and `ok` becomes false if any warning is present. */
  strict?: boolean;
}
