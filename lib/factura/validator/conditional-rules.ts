/**
 * Conditional-rule engine.
 *
 * Each rule below maps a (tipo, payloadKey) pair to a predicate over the
 * runtime payload / form context.  When the predicate returns `true`, the
 * field is treated as REQUIRED — i.e. missing values produce
 * `CONDITIONAL_MISSING` errors and `esCampoRequerido()` returns true.
 *
 * Conditions that have NO rule registered here remain in plain CONDITIONAL
 * limbo: they will not flag a missing-value error, and the form may render
 * them as optional with a tooltip.
 *
 * References (DGII norma 06-2018 + ecf-api `condicion` strings):
 *   - fechaLimitePago: tipoPago === 2 (Crédito)
 *   - fechaNCFModificado, codigoModificacion: ncfModificado present
 *   - indicadorMontoGravado: items with ITBIS gravado
 *   - rncComprador / razonSocialComprador / identificadorExtranjero: tipo 32 + montoTotal >= 250000
 */
import type { ValidationContext } from './types';

const THRESHOLD_E32_RNC = 250_000;

type Predicate = (
  payload: Record<string, unknown>,
  ctx: ValidationContext,
) => boolean;

/**
 * A rule key is `<tipo>:<payloadKey>` so we can look up O(1) at validation time.
 */
type RuleKey = string;

function key(tipo: string, payloadKey: string): RuleKey {
  return `${tipo}:${payloadKey}`;
}

/** Truthy-but-not-empty helper: 0 is *present*, '' and null/undefined are not. */
function isPresent(v: unknown): boolean {
  if (v === undefined || v === null) return false;
  if (typeof v === 'string') return v.trim().length > 0;
  return true;
}

function resolveTipoPago(
  payload: Record<string, unknown>,
  ctx: ValidationContext,
): number | undefined {
  if (ctx.tipoPago !== undefined) return ctx.tipoPago;
  const raw = payload['tipoPago'];
  if (typeof raw === 'number') return raw;
  if (typeof raw === 'string' && raw.trim() !== '') return Number(raw);
  return undefined;
}

function resolveNcfModificado(
  payload: Record<string, unknown>,
  ctx: ValidationContext,
): string | undefined {
  if (ctx.ncfModificado && ctx.ncfModificado.trim() !== '') return ctx.ncfModificado;
  const raw = payload['ncfModificado'];
  if (typeof raw === 'string' && raw.trim() !== '') return raw;
  return undefined;
}

function resolveMontoTotal(
  payload: Record<string, unknown>,
  ctx: ValidationContext,
): number | undefined {
  if (ctx.montoTotal !== undefined) return ctx.montoTotal;
  const raw = payload['montoTotal'];
  if (typeof raw === 'number') return raw;
  if (typeof raw === 'string' && raw.trim() !== '') return Number(raw);
  return undefined;
}

function resolveRncComprador(
  payload: Record<string, unknown>,
  ctx: ValidationContext,
): string | undefined {
  if (ctx.rncComprador && ctx.rncComprador.trim() !== '') return ctx.rncComprador;
  const raw = payload['rncComprador'];
  if (typeof raw === 'string' && raw.trim() !== '') return raw;
  if (typeof raw === 'number') return String(raw);
  return undefined;
}

function hasItbisItems(
  payload: Record<string, unknown>,
  ctx: ValidationContext,
): boolean {
  if (ctx.hasItbisItems !== undefined) return ctx.hasItbisItems;
  const items = payload['items'];
  if (!Array.isArray(items)) return false;
  return items.some((it) => {
    if (!it || typeof it !== 'object') return false;
    const ind = (it as Record<string, unknown>)['indicadorFacturacion'];
    // DGII codes: 1 = Gravado tasa general (18%), 2 = 16%, 3 = 0%, 4 = exento.
    // Items with code 1, 2, or 3 are "ITBIS items"; code 4 is exempt.
    const n = typeof ind === 'number' ? ind : Number(ind);
    return n === 1 || n === 2 || n === 3;
  });
}

function hasIsrRetencion(
  payload: Record<string, unknown>,
  ctx: ValidationContext,
): boolean {
  if (ctx.hasIsrRetencion !== undefined) return ctx.hasIsrRetencion;
  const items = payload['items'];
  if (!Array.isArray(items)) return false;
  return items.some((it) => {
    if (!it || typeof it !== 'object') return false;
    const v = (it as Record<string, unknown>)['montoISRRetenido'];
    const n = typeof v === 'number' ? v : Number(v);
    return Number.isFinite(n) && n > 0;
  });
}

// ---------------------------------------------------------------------------
// Rule registry
// ---------------------------------------------------------------------------

const RULES = new Map<RuleKey, Predicate>();

function registerForTipos(
  tipos: readonly string[],
  payloadKey: string,
  predicate: Predicate,
): void {
  for (const t of tipos) RULES.set(key(t, payloadKey), predicate);
}

// fechaLimitePago — required when tipoPago === 2 (Crédito)
// Applies to tipos: 31, 32, 33, 34, 41, 44, 45, 46  (not 43, 47)
registerForTipos(
  ['31', '32', '33', '34', '41', '44', '45', '46'],
  'fechaLimitePago',
  (p, c) => resolveTipoPago(p, c) === 2,
);

// fechaNCFModificado — required when ncfModificado is present.
// Applies to all tipos that have ncfModificado as CONDITIONAL.
registerForTipos(
  ['31', '32', '33', '34', '41', '43', '44', '45', '46', '47'],
  'fechaNCFModificado',
  (p, c) => resolveNcfModificado(p, c) !== undefined,
);

// codigoModificacion — required when ncfModificado is present.
registerForTipos(
  ['31', '32', '33', '34', '41', '43', '44', '45', '46', '47'],
  'codigoModificacion',
  (p, c) => resolveNcfModificado(p, c) !== undefined,
);

// indicadorMontoGravado — required when at least one item is ITBIS-taxed.
// Applies to: 31, 32, 33, 34, 41, 45.
registerForTipos(
  ['31', '32', '33', '34', '41', '45'],
  'indicadorMontoGravado',
  (p, c) => hasItbisItems(p, c),
);

// totalISRRetencion — required when at least one item has ISR retained.
// (Schema lists it conditional for 31, 33, 34, 41, 47.)
registerForTipos(
  ['31', '33', '34', '41', '47'],
  'totalISRRetencion',
  (p, c) => hasIsrRetencion(p, c),
);

// E32 RNC threshold rules — montoTotal >= 250,000 ⇒ rncComprador + razonSocialComprador required.
RULES.set(key('32', 'rncComprador'), (p, c) => {
  const m = resolveMontoTotal(p, c);
  return m !== undefined && m >= THRESHOLD_E32_RNC;
});
RULES.set(key('32', 'razonSocialComprador'), (p, c) => {
  const m = resolveMontoTotal(p, c);
  return m !== undefined && m >= THRESHOLD_E32_RNC;
});
// E32 identificadorExtranjero — required when montoTotal >= 250k AND rncComprador empty.
RULES.set(key('32', 'identificadorExtranjero'), (p, c) => {
  const m = resolveMontoTotal(p, c);
  if (m === undefined || m < THRESHOLD_E32_RNC) return false;
  return resolveRncComprador(p, c) === undefined;
});

// rncComprador / razonSocialComprador / identificadorExtranjero for tipos 33/34/44/46:
//   These tipos inherit the same threshold logic as tipo 32 because the schemas
//   tag them CONDITIONAL with the same condicion string.  They behave as 32-style.
for (const t of ['33', '34', '44', '46']) {
  RULES.set(key(t, 'rncComprador'), (p, c) => {
    const m = resolveMontoTotal(p, c);
    return m !== undefined && m >= THRESHOLD_E32_RNC;
  });
  RULES.set(key(t, 'razonSocialComprador'), (p, c) => {
    const m = resolveMontoTotal(p, c);
    return m !== undefined && m >= THRESHOLD_E32_RNC;
  });
  RULES.set(key(t, 'identificadorExtranjero'), (p, c) => {
    const m = resolveMontoTotal(p, c);
    if (m === undefined || m < THRESHOLD_E32_RNC) return false;
    return resolveRncComprador(p, c) === undefined;
  });
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Returns true if a CONDITIONAL field is currently required given the runtime
 * payload + context.  Returns false for unknown rules (i.e. the field stays
 * optional from the form's point of view).
 */
export function isConditionalRequired(
  tipo: string,
  payloadKey: string,
  payload: Record<string, unknown>,
  ctx: ValidationContext = {},
): boolean {
  const fn = RULES.get(key(tipo, payloadKey));
  if (!fn) return false;
  return fn(payload, ctx);
}

/** Internal helper exposed for tests. Counts how many rules are registered. */
export function _ruleCount(): number {
  return RULES.size;
}

export { isPresent };
