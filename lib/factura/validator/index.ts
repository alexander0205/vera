/**
 * Schema-driven validator for DGII e-CF invoices.
 *
 * Public surface:
 *   - validate(tipo, payload, options) — primary entry point.
 *   - Re-exports from schema-loader & ui-helpers for convenience.
 */
import { isConditionalRequired, isPresent } from './conditional-rules';
import {
  getCampo,
  getCamposByObligatoriedad,
  getSchema,
  SUPPORTED_TIPOS,
} from './schema-loader';
import type {
  CampoSchema,
  CampoTipo,
  ValidateOptions,
  ValidationContext,
  ValidationError,
  ValidationResult,
} from './types';

// ---------------------------------------------------------------------------
// Field-level checkers
// ---------------------------------------------------------------------------

const DATE_PATTERN = /^([0-3]\d)-([01]\d)-(\d{4})$/;

function typeMatches(value: unknown, tipo: CampoTipo): boolean {
  if (value === null || value === undefined) return true; // presence is handled separately
  switch (tipo) {
    case 'NUM':
    case 'DECIMAL': {
      if (typeof value === 'number') return Number.isFinite(value);
      if (typeof value === 'string' && value.trim() !== '')
        return Number.isFinite(Number(value));
      return false;
    }
    case 'BOOL':
      return typeof value === 'boolean';
    case 'FECHA':
      return typeof value === 'string' && DATE_PATTERN.test(value);
    case 'ALFA':
    case 'ALFANUM':
      return typeof value === 'string' || typeof value === 'number';
    default:
      return true;
  }
}

function lengthOk(value: unknown, maxLength: number | undefined): boolean {
  if (maxLength === undefined) return true;
  if (value === null || value === undefined) return true;
  const s = typeof value === 'string' ? value : String(value);
  return s.length <= maxLength;
}

function inEnum(
  value: unknown,
  valoresValidos: (string | number)[] | undefined,
): boolean {
  if (!valoresValidos || valoresValidos.length === 0) return true;
  if (value === null || value === undefined) return true;
  // Match by loose equality across number/string representations.
  if (typeof value === 'number') return valoresValidos.includes(value);
  if (typeof value === 'string') {
    if (valoresValidos.includes(value)) return true;
    const asNum = Number(value);
    return Number.isFinite(asNum) && valoresValidos.includes(asNum);
  }
  return false;
}

// ---------------------------------------------------------------------------
// Payload traversal
// ---------------------------------------------------------------------------

const ITEM_PREFIX = 'items[].';

function getTopLevelValue(
  payload: Record<string, unknown>,
  payloadKey: string,
): unknown {
  return payload[payloadKey];
}

function getItemsArray(payload: Record<string, unknown>): unknown[] {
  const raw = payload['items'];
  return Array.isArray(raw) ? raw : [];
}

function getItemValue(item: unknown, itemKey: string): unknown {
  if (!item || typeof item !== 'object') return undefined;
  return (item as Record<string, unknown>)[itemKey];
}

// ---------------------------------------------------------------------------
// Error helpers
// ---------------------------------------------------------------------------

function makeError(
  campo: CampoSchema,
  rule: ValidationError['rule'],
  message: string,
  value?: unknown,
  itemIndex?: number,
): ValidationError {
  const err: ValidationError = {
    payloadKey: campo.payloadKey,
    nombre: campo.nombre,
    seccion: campo.seccion,
    rule,
    message,
  };
  if (value !== undefined) err.value = value;
  if (itemIndex !== undefined) err.itemIndex = itemIndex;
  return err;
}

// ---------------------------------------------------------------------------
// Field-level checks (shared by top-level and item-level)
// ---------------------------------------------------------------------------

function checkValueShape(
  campo: CampoSchema,
  value: unknown,
  errors: ValidationError[],
  itemIndex?: number,
): void {
  if (!isPresent(value)) return;

  if (!typeMatches(value, campo.tipo)) {
    if (campo.tipo === 'FECHA') {
      errors.push(
        makeError(
          campo,
          'INVALID_DATE_FORMAT',
          `${campo.nombre}: fecha debe tener formato dd-MM-yyyy`,
          value,
          itemIndex,
        ),
      );
    } else {
      errors.push(
        makeError(
          campo,
          'INVALID_TYPE',
          `${campo.nombre}: tipo inválido (esperado ${campo.tipo})`,
          value,
          itemIndex,
        ),
      );
    }
    return; // do not also flag enum/length on the wrong-type value
  }

  if (!lengthOk(value, campo.maxLength)) {
    errors.push(
      makeError(
        campo,
        'MAX_LENGTH',
        `${campo.nombre}: excede la longitud máxima de ${campo.maxLength} caracteres`,
        value,
        itemIndex,
      ),
    );
  }

  if (!inEnum(value, campo.valoresValidos)) {
    errors.push(
      makeError(
        campo,
        'INVALID_ENUM',
        `${campo.nombre}: valor no permitido (válidos: ${campo.valoresValidos?.join(', ')})`,
        value,
        itemIndex,
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

export function validate(
  tipo: string,
  payload: Record<string, unknown>,
  options: ValidateOptions = {},
): ValidationResult {
  const ctx: ValidationContext = options.context ?? {};
  const errors: ValidationError[] = [];
  const warnings: ValidationError[] = [];

  const schema = getSchema(tipo);
  if (!schema) {
    return {
      ok: false,
      errors: [
        {
          payloadKey: '__tipo__',
          nombre: 'Tipo de Comprobante',
          seccion: 'IdDoc',
          rule: 'INVALID_ENUM',
          message: `Tipo de comprobante no soportado: ${tipo}`,
          value: tipo,
        },
      ],
      warnings: [],
    };
  }

  const items = getItemsArray(payload);

  for (const campo of schema.campos) {
    const isItemField = campo.payloadKey.startsWith(ITEM_PREFIX);

    if (isItemField) {
      const itemKey = campo.payloadKey.slice(ITEM_PREFIX.length);
      // Apply rules to each item independently.
      items.forEach((item, idx) => {
        const value = getItemValue(item, itemKey);
        const present = isPresent(value);

        if (campo.obligatoriedad === 'REQUIRED' && !present) {
          errors.push(
            makeError(
              campo,
              'REQUIRED_MISSING',
              `${campo.nombre}: requerido en ítem ${idx + 1}`,
              undefined,
              idx,
            ),
          );
          return;
        }
        if (campo.obligatoriedad === 'FORBIDDEN' && present) {
          errors.push(
            makeError(
              campo,
              'FORBIDDEN_PRESENT',
              `${campo.nombre}: no debe estar presente en tipo ${tipo} (ítem ${idx + 1})`,
              value,
              idx,
            ),
          );
          return;
        }
        // CONDITIONAL on item-level fields: no per-item predicate today.
        // We still validate the value's shape if present.
        checkValueShape(campo, value, errors, idx);
      });
      continue;
    }

    // Top-level field
    const value = getTopLevelValue(payload, campo.payloadKey);
    const present = isPresent(value);

    if (campo.obligatoriedad === 'REQUIRED') {
      if (!present) {
        errors.push(
          makeError(
            campo,
            'REQUIRED_MISSING',
            `${campo.nombre}: campo requerido`,
          ),
        );
        continue;
      }
    } else if (campo.obligatoriedad === 'FORBIDDEN') {
      if (present) {
        errors.push(
          makeError(
            campo,
            'FORBIDDEN_PRESENT',
            `${campo.nombre}: no debe estar presente en tipo ${tipo}`,
            value,
          ),
        );
        continue;
      }
    } else if (campo.obligatoriedad === 'CONDITIONAL') {
      const required = isConditionalRequired(tipo, campo.payloadKey, payload, ctx);
      if (required && !present) {
        errors.push(
          makeError(
            campo,
            'CONDITIONAL_MISSING',
            campo.condicion
              ? `${campo.nombre}: requerido (${campo.condicion})`
              : `${campo.nombre}: requerido por la condición del esquema`,
          ),
        );
        continue;
      }
    }

    checkValueShape(campo, value, errors);
  }

  const combinedErrors = options.strict ? [...errors, ...warnings] : errors;
  return {
    ok: combinedErrors.length === 0,
    errors: combinedErrors,
    warnings,
  };
}

// Re-exports — keep the public surface tidy.
export { getCampo, getCamposByObligatoriedad, getSchema, SUPPORTED_TIPOS };
export type {
  CampoSchema,
  CampoTipo,
  Obligatoriedad,
  TipoSchema,
  ValidateOptions,
  ValidationContext,
  ValidationError,
  ValidationResult,
  ValidationRule,
} from './types';
export {
  esCampoOculto,
  esCampoRequerido,
  getCamposObligatorios,
  getCampoHint,
} from './ui-helpers';
