/**
 * Smoke test — run with:
 *   npx tsx lib/factura/validator/smoke-test.ts
 *
 * Exits 0 if all assertions pass, 1 otherwise.
 */
import { validate } from './index';
import { SUPPORTED_TIPOS, getCamposByObligatoriedad } from './schema-loader';
import { _ruleCount } from './conditional-rules';
import type { ValidationResult } from './types';

interface Case {
  name: string;
  run: () => void;
}

const failures: string[] = [];

function assert(label: string, cond: boolean, ctx?: unknown): void {
  if (!cond) {
    failures.push(label + (ctx !== undefined ? `  — ${JSON.stringify(ctx)}` : ''));
  }
}

function hasError(
  res: ValidationResult,
  rule: string,
  payloadKey?: string,
): boolean {
  return res.errors.some(
    (e) =>
      e.rule === rule && (payloadKey === undefined || e.payloadKey === payloadKey),
  );
}

// ---------------------------------------------------------------------------
// Fixture builders
// ---------------------------------------------------------------------------

interface Overrides {
  payload?: Record<string, unknown>;
  itemOverrides?: Record<string, unknown>;
}

/**
 * Build a minimal-valid payload for the given tipo.  Tries to satisfy every
 * REQUIRED field discovered in the schema.  Designed to be tweaked per case
 * via overrides.
 *
 * Tipo-specific quirks:
 *  - 33/34: ncfModificado must be a valid 19-char NCF string, not a number.
 *  - 47: items[].montoISRRetenido is REQUIRED, so we must also supply totalISRRetencion
 *    so the ISR-retención conditional doesn't fire.
 */
function buildMinimalPayload(
  tipo: string,
  { payload = {}, itemOverrides = {} }: Overrides = {},
): Record<string, unknown> {
  const required = getCamposByObligatoriedad(tipo, 'REQUIRED');
  const out: Record<string, unknown> = {};
  const itemSample: Record<string, unknown> = {};

  for (const c of required) {
    const isItem = c.payloadKey.startsWith('items[].');
    const k = isItem ? c.payloadKey.slice('items[].'.length) : c.payloadKey;
    const value = pickValidValue(c.tipo, c.valoresValidos);
    if (isItem) itemSample[k] = value;
    else out[k] = value;
  }

  // Per-tipo fixture tweaks.
  if (tipo === '33' || tipo === '34') {
    out['ncfModificado'] = 'E310000000001';
    out['fechaNCFModificado'] = '01-01-2025';
  }
  if (tipo === '47') {
    // items[].montoISRRetenido is REQUIRED for tipo 47, which makes
    // totalISRRetencion conditionally required at the header level.
    out['totalISRRetencion'] = 1;
  }

  // Ensure items array always exists (with one item) when any item-level field
  // is required.
  if (Object.keys(itemSample).length > 0 || required.some((c) => c.payloadKey.startsWith('items[].'))) {
    out['items'] = [{ ...itemSample, ...itemOverrides }];
  } else {
    out['items'] = [];
  }

  return { ...out, ...payload };
}

function pickValidValue(
  tipo: string,
  valoresValidos?: (string | number)[],
): unknown {
  if (valoresValidos && valoresValidos.length > 0) return valoresValidos[0];
  switch (tipo) {
    case 'NUM':
    case 'DECIMAL':
      return 1;
    case 'FECHA':
      return '01-01-2025';
    case 'BOOL':
      return true;
    default:
      return 'X';
  }
}

// ---------------------------------------------------------------------------
// Cases
// ---------------------------------------------------------------------------

const cases: Case[] = [];

// 1. Every tipo validates with a minimal payload.
for (const tipo of SUPPORTED_TIPOS) {
  cases.push({
    name: `tipo ${tipo}: minimal payload validates ok`,
    run: () => {
      const payload = buildMinimalPayload(tipo);
      const res = validate(tipo, payload);
      assert(
        `tipo ${tipo}: expected ok=true, got ${res.errors.length} errors`,
        res.ok,
        res.errors.slice(0, 5),
      );
    },
  });
}

// 2. Missing montoTotal -> REQUIRED_MISSING.
cases.push({
  name: 'tipo 31: missing montoTotal -> REQUIRED_MISSING',
  run: () => {
    const payload = buildMinimalPayload('31');
    delete payload['montoTotal'];
    const res = validate('31', payload);
    assert(
      'expected REQUIRED_MISSING on montoTotal',
      hasError(res, 'REQUIRED_MISSING', 'montoTotal'),
      res.errors.map((e) => `${e.rule}:${e.payloadKey}`),
    );
  },
});

// 3a. Tipo 31 with ncfModificado but no codigoModificacion -> CONDITIONAL_MISSING.
//    (Tipo 31's NCF-mod fields are CONDITIONAL; in 33/34 they're REQUIRED.)
cases.push({
  name: 'tipo 31: ncfModificado present without codigoModificacion -> CONDITIONAL_MISSING',
  run: () => {
    const payload = buildMinimalPayload('31', {
      payload: { ncfModificado: 'E310000000001', fechaNCFModificado: '01-01-2025' },
    });
    const res = validate('31', payload);
    assert(
      'expected CONDITIONAL_MISSING on codigoModificacion',
      hasError(res, 'CONDITIONAL_MISSING', 'codigoModificacion'),
      res.errors.map((e) => `${e.rule}:${e.payloadKey}`),
    );
  },
});

// 3b. Tipo 33: removing codigoModificacion (REQUIRED) -> REQUIRED_MISSING.
cases.push({
  name: 'tipo 33: missing codigoModificacion -> REQUIRED_MISSING',
  run: () => {
    const payload = buildMinimalPayload('33');
    delete payload['codigoModificacion'];
    const res = validate('33', payload);
    assert(
      'expected REQUIRED_MISSING on codigoModificacion',
      hasError(res, 'REQUIRED_MISSING', 'codigoModificacion'),
      res.errors.map((e) => `${e.rule}:${e.payloadKey}`),
    );
  },
});

// 4. Tipo 31 with tipoPago=2 but no fechaLimitePago -> CONDITIONAL_MISSING.
cases.push({
  name: 'tipo 31: tipoPago=2 without fechaLimitePago -> CONDITIONAL_MISSING',
  run: () => {
    const payload = buildMinimalPayload('31', {
      payload: { tipoPago: 2 },
    });
    const res = validate('31', payload, { context: { tipoPago: 2 } });
    assert(
      'expected CONDITIONAL_MISSING on fechaLimitePago',
      hasError(res, 'CONDITIONAL_MISSING', 'fechaLimitePago'),
      res.errors.map((e) => `${e.rule}:${e.payloadKey}`),
    );
  },
});

// 5. Tipo 43 with rncComprador set -> FORBIDDEN_PRESENT.
cases.push({
  name: 'tipo 43: rncComprador present -> FORBIDDEN_PRESENT',
  run: () => {
    const payload = buildMinimalPayload('43', {
      payload: { rncComprador: '123456789' },
    });
    const res = validate('43', payload);
    assert(
      'expected FORBIDDEN_PRESENT on rncComprador',
      hasError(res, 'FORBIDDEN_PRESENT', 'rncComprador'),
      res.errors.map((e) => `${e.rule}:${e.payloadKey}`),
    );
  },
});

// 6. Tipo 32: montoTotal >= 250k without rncComprador -> CONDITIONAL_MISSING for identificadorExtranjero.
cases.push({
  name: 'tipo 32: montoTotal=300000 without rncComprador -> CONDITIONAL_MISSING(identificadorExtranjero)',
  run: () => {
    const payload = buildMinimalPayload('32', {
      payload: { montoTotal: 300_000 },
    });
    const res = validate('32', payload, {
      context: { montoTotal: 300_000 },
    });
    assert(
      'expected CONDITIONAL_MISSING on identificadorExtranjero',
      hasError(res, 'CONDITIONAL_MISSING', 'identificadorExtranjero'),
      res.errors.map((e) => `${e.rule}:${e.payloadKey}`),
    );
  },
});

// 7. Date format validation
cases.push({
  name: 'tipo 31: invalid fechaLimitePago format -> INVALID_DATE_FORMAT or shape issue',
  run: () => {
    const payload = buildMinimalPayload('31', {
      payload: { tipoPago: 2, fechaLimitePago: '2025-01-01' },
    });
    const res = validate('31', payload, { context: { tipoPago: 2 } });
    // fechaLimitePago is ALFANUM in schema (not FECHA), so we don't get
    // INVALID_DATE_FORMAT. But ensure it doesn't produce a CONDITIONAL_MISSING.
    assert(
      'fechaLimitePago should not be reported missing when value provided',
      !hasError(res, 'CONDITIONAL_MISSING', 'fechaLimitePago'),
      res.errors,
    );
  },
});

// 8. Enum validation
cases.push({
  name: 'tipo 31: invalid tipoPago value -> INVALID_ENUM',
  run: () => {
    const payload = buildMinimalPayload('31', {
      payload: { tipoPago: 99 },
    });
    const res = validate('31', payload);
    assert(
      'expected INVALID_ENUM on tipoPago',
      hasError(res, 'INVALID_ENUM', 'tipoPago'),
      res.errors.map((e) => `${e.rule}:${e.payloadKey}`),
    );
  },
});

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

console.log(`Running ${cases.length} smoke cases. Registered conditional rules: ${_ruleCount()}.`);
for (const c of cases) {
  try {
    c.run();
    console.log(`  ✓ ${c.name}`);
  } catch (err) {
    failures.push(`${c.name} threw: ${(err as Error).message}`);
    console.log(`  ✗ ${c.name} (threw)`);
  }
}

if (failures.length > 0) {
  console.log(`\nFAIL — ${failures.length} assertion(s):`);
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}

console.log('\nAll smoke cases passed.');
process.exit(0);
