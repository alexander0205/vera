# `lib/factura/validator`

Schema-driven validator for DGII e-CF payloads (tipos 31, 32, 33, 34, 41, 43, 44, 45, 46, 47).

The library is **pure** — no DB, no network, no side effects at import time — and is tree-shakeable through named exports.  It is safe to call from Server Components, Server Actions, Route Handlers, and Client Components alike.

---

## Quick start

```ts
import { validate } from '@/lib/factura/validator';

const result = validate('31', payload, {
  context: {
    tipoPago: 2,            // unlocks "fechaLimitePago" conditional rule
    montoTotal: 300_000,    // unlocks the E32 250k-threshold rules
  },
});

if (!result.ok) {
  for (const err of result.errors) {
    console.log(err.payloadKey, '→', err.rule, '—', err.message);
  }
}
```

### UI helpers (render-time)

```ts
import { esCampoRequerido, esCampoOculto, getCampoHint } from '@/lib/factura/validator';

esCampoRequerido('31', 'fechaLimitePago', { tipoPago: 2 }); // true
esCampoOculto('43', 'rncComprador');                         // true
getCampoHint('31', 'rncComprador');                          // "DGII #38 · NUM · máx 11 · Comprador"
```

### Discovering fields for a tipo

```ts
import { getCamposObligatorios, getCamposByObligatoriedad } from '@/lib/factura/validator';

getCamposObligatorios('32', { montoTotal: 400_000 });
// => REQUIRED fields + rncComprador / razonSocialComprador / identificadorExtranjero conditionals.

getCamposByObligatoriedad('31', 'FORBIDDEN'); // every field the form must hide for tipo 31
```

---

## Validation rules

| Rule | When |
|------|------|
| `REQUIRED_MISSING` | Field marked `REQUIRED` in the schema is missing/empty. |
| `CONDITIONAL_MISSING` | Field is `CONDITIONAL` and the registered predicate fires (see table below). |
| `FORBIDDEN_PRESENT` | Field is `FORBIDDEN` for the tipo but a non-empty value was supplied. |
| `INVALID_TYPE` | Value's runtime type doesn't match the schema `tipo` (NUM/ALFANUM/etc.). |
| `MAX_LENGTH` | String/number exceeds the schema's `maxLength`. |
| `INVALID_ENUM` | Value is not in `valoresValidos`. |
| `INVALID_DATE_FORMAT` | `FECHA` field is not in `dd-MM-yyyy` form. |

### Conditional rules implemented

| Tipo(s) | Field | Triggers when |
|---------|-------|---------------|
| 31, 32, 33, 34, 41, 44, 45, 46 | `fechaLimitePago` | `tipoPago === 2` (Crédito) |
| 31, 32, 41, 43, 44, 45, 46, 47 | `fechaNCFModificado` | `ncfModificado` present |
| 31, 32, 41, 43, 44, 45, 46, 47 | `codigoModificacion` | `ncfModificado` present |
| 31, 32, 33, 34, 41, 45 | `indicadorMontoGravado` | any item has `indicadorFacturacion ∈ {1,2,3}` |
| 31, 33, 34, 41, 47 | `totalISRRetencion` | any item has `montoISRRetenido > 0` |
| 32, 33, 34, 44, 46 | `rncComprador` | `montoTotal >= 250_000` |
| 32, 33, 34, 44, 46 | `razonSocialComprador` | `montoTotal >= 250_000` |
| 32, 33, 34, 44, 46 | `identificadorExtranjero` | `montoTotal >= 250_000` **and** `rncComprador` empty |

Total: **54 conditional predicates** registered (tipo × payloadKey).

Conditional fields in the schema that have **no** registered predicate (e.g. `montoNoFacturable`, `items[].descuentoMonto`, `items[].recargoMonto`, `items[].indicadorAgenteRetencionoPercepcion`, `items[].montoISRRetenido`, `items[].montoITBISRetenido`, `rncOtroContribuyente`) remain optional from the form's perspective — they are validated for shape only.

---

## Required-field counts per tipo (from cached schemas)

| Tipo | Required | Total fields |
|------|----------|--------------|
| 31 (Factura Crédito Fiscal) | 11 | 40 |
| 32 (Factura de Consumo) | 9 | 40 |
| 33 (Nota de Débito) | 11 | 40 |
| 34 (Nota de Crédito) | 12 | 40 |
| 41 (Compras) | 11 | 40 |
| 43 (Gastos Menores) | 7 | 40 |
| 44 (Regímenes Especiales) | 10 | 40 |
| 45 (Gubernamental) | 11 | 40 |
| 46 (Exportaciones) | 10 | 40 |
| 47 (Pagos al Exterior) | 9 | 40 |

---

## Re-fetching schemas

The 10 JSON files in `./schemas/` are static at build time.  Re-fetch them whenever DGII publishes an updated norma, or whenever the ecf-api `GET /v1/schemas/ecf/{tipo}` response shape changes:

```bash
for t in 31 32 33 34 41 43 44 45 46 47; do
  curl -s "https://ecf-api.yisraeltech.com/v1/schemas/ecf/$t" \
    > lib/factura/validator/schemas/$t.json
done
```

A future improvement is a cron task that pulls these into the DB and a runtime loader that prefers DB over the cached JSON.

---

## Examples

### 1. Validate a server-action payload before submission

```ts
// app/(dashboard)/dashboard/facturas/nueva/actions.ts
'use server';
import { validate } from '@/lib/factura/validator';

export async function crearFactura(input: NuevaFacturaInput) {
  const result = validate(input.tipo, input.payload, {
    context: {
      tipoPago: input.payload.tipoPago,
      montoTotal: input.payload.montoTotal,
      ncfModificado: input.payload.ncfModificado,
      rncComprador: input.payload.rncComprador,
    },
  });
  if (!result.ok) {
    return { ok: false, errors: result.errors };
  }
  // …continue with emission
}
```

### 2. Drive form rendering (asterisks + hidden inputs)

```tsx
'use client';
import { esCampoOculto, esCampoRequerido, getCampoHint } from '@/lib/factura/validator';

function FacturaField({ tipo, payloadKey, value, ctx }: Props) {
  if (esCampoOculto(tipo, payloadKey)) return null;
  const required = esCampoRequerido(tipo, payloadKey, ctx, { [payloadKey]: value });
  return (
    <label title={getCampoHint(tipo, payloadKey)}>
      {payloadKey}
      {required && <span aria-hidden> *</span>}
      <input name={payloadKey} required={required} />
    </label>
  );
}
```

### 3. Inspect schema metadata programmatically

```ts
import { getSchema, getCampo } from '@/lib/factura/validator';

const schema = getSchema('31');
console.log(schema?.resumen);
// { total: 40, required: 11, conditional: 13, optional: 11, forbidden: 5 }

const campo = getCampo('31', 'rncComprador');
console.log(campo?.xmlTag, campo?.maxLength); // "<RNCComprador>" 11
```
