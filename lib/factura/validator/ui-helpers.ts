/**
 * Form-facing helpers.  Cheap, sync, side-effect-free — safe to call inside
 * render or `useMemo` hooks.
 */
import { isConditionalRequired } from './conditional-rules';
import { getCampo, getSchema } from './schema-loader';
import type { CampoSchema, ValidationContext } from './types';

/**
 * Should this input render with a required marker (asterisk)?
 *
 * - REQUIRED fields: always true
 * - CONDITIONAL fields: true when the registered predicate fires
 * - OPTIONAL / FORBIDDEN: false
 */
export function esCampoRequerido(
  tipo: string,
  payloadKey: string,
  ctx?: ValidationContext,
  payload: Record<string, unknown> = {},
): boolean {
  const campo = getCampo(tipo, payloadKey);
  if (!campo) return false;
  if (campo.obligatoriedad === 'REQUIRED') return true;
  if (campo.obligatoriedad === 'CONDITIONAL') {
    return isConditionalRequired(tipo, payloadKey, payload, ctx ?? {});
  }
  return false;
}

/**
 * Should this input be hidden/disabled because the field is forbidden for
 * this tipo de comprobante?
 */
export function esCampoOculto(tipo: string, payloadKey: string): boolean {
  const campo = getCampo(tipo, payloadKey);
  if (!campo) return false;
  return campo.obligatoriedad === 'FORBIDDEN';
}

/**
 * Returns a short tooltip string for the input, e.g.
 *   "DGII #38, NUM, máx 11 — Comprador"
 */
export function getCampoHint(tipo: string, payloadKey: string): string {
  const campo = getCampo(tipo, payloadKey);
  if (!campo) return '';
  const parts = [`DGII #${campo.dgiiNo}`, campo.tipo];
  if (campo.maxLength !== undefined) parts.push(`máx ${campo.maxLength}`);
  if (campo.valoresValidos && campo.valoresValidos.length > 0) {
    parts.push(`valores: ${campo.valoresValidos.join(', ')}`);
  }
  parts.push(campo.seccion);
  return parts.join(' · ');
}

/**
 * Returns the list of fields that must be filled in for the given context —
 * always-required PLUS conditionals whose predicate currently fires.
 */
export function getCamposObligatorios(
  tipo: string,
  ctx: ValidationContext = {},
  payload: Record<string, unknown> = {},
): CampoSchema[] {
  const schema = getSchema(tipo);
  if (!schema) return [];
  return schema.campos.filter((c) => {
    if (c.obligatoriedad === 'REQUIRED') return true;
    if (c.obligatoriedad === 'CONDITIONAL') {
      return isConditionalRequired(tipo, c.payloadKey, payload, ctx);
    }
    return false;
  });
}
