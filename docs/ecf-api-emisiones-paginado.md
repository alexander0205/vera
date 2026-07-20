# Listado paginado de emisiones — guía de integración

**Rama:** `claude/cool-shannon-2d662c` · **Commit:** `6f5b95f`
**Estado:** commiteado, **NO desplegado** (deploy a prod pendiente para la noche).
**Fecha:** 2026-07-14

> **Nota emitedo-v2:** este endpoint lo consume `lib/ecf-api/client.ts` → `emision.list()`, usado en
> `app/admin/empresas/[id]/_ecf-section.tsx` (panel admin). Al adoptar el nuevo shape hay que
> desenvolver `res.data` en `emision.list()`. Los campos que usa la UI (`estado`, `tipoComprobante`,
> `ambiente`, `eNcf`, `montoTotal`) siguen presentes en el DTO liviano.

---

## 1. Qué se hizo

Se reemplazó el endpoint de listado de emisiones por uno **paginado, ordenable y liviano**.

### Antes (problema)
`GET /contribuyentes/:codigoPublico/emisiones?limit=N`
- Devolvía un **array pelado** `[...]`.
- Cap fijo de 200, **sin paginación real** (no se podía pasar de 200 ni paginar).
- Orden fijo por `createdAt desc`.
- Cada fila traía la **fila completa**, incluido `xmlFirmado` (XML entero) → payloads enormes, alto consumo.

### Ahora
`GET /contribuyentes/:codigoPublico/emisiones` (alias: `/facturas`)
- Respuesta `{ data, pagination }`.
- Paginación **cursor (keyset)** y **offset (page)** + `limit`.
- Orden desc por **fecha** (default) o **secuencia** (eNcf).
- Filas **livianas**: sin XML ni payloads pesados.
- Filtros opcionales por `estado` y `formato`.

---

## 2. ⚠️ BREAKING CHANGE (acción del front)

La respuesta cambió de forma:

```diff
- GET .../emisiones            →  [ {emision}, {emision}, ... ]
+ GET .../emisiones            →  { "data": [ {emision}, ... ], "pagination": {...} }
```

**El front debe:**
1. Leer las filas en **`res.data`** (antes era `res` directo).
2. Los campos pesados (`xmlFirmado`, `respuestaDgii`, `payloadRaw`) **ya NO vienen** en el listado. Para el detalle completo de una factura usar **`GET /emisiones/:id`**.
3. Usar `res.pagination` para paginar (ver sección 5).

---

## 3. Query params

| Param | Tipo | Default | Descripción |
|---|---|---|---|
| `limit` | int 1–200 | `50` | Filas por página |
| `orderBy` | `fecha` \| `secuencia` | `fecha` | Campo de orden. `secuencia` = eNcf |
| `order` | `asc` \| `desc` | `desc` | Dirección |
| `cursor` | string | — | Token keyset (de `pagination.nextCursor`). **Prioridad sobre `page`** |
| `page` | int ≥1 | — | Página offset (1-based). Devuelve `total`/`totalPages` |
| `estado` | enum | — | Filtro: `PENDIENTE`,`ENVIADO`,`ACEPTADO`,`ACEPTADO_CONDICIONAL`,`RECHAZADO`,`ERROR` |
| `formato` | enum | — | Filtro: `RFCE`, `ECF` |

Reglas:
- Si se envía `cursor` → modo keyset (se ignora `page`).
- Si se envía `page` (sin `cursor`) → modo offset.
- Si no se envía ninguno → primera página keyset.

---

## 4. Forma de la respuesta

```jsonc
{
  "data": [
    {
      "id": "cmoetlomk0001ca8put5ls4ce",
      "eNcf": "E320000000109",
      "tipoComprobante": "32",
      "formato": "RFCE",
      "ambiente": "Produccion",
      "estado": "ACEPTADO",
      "trackId": null,
      "montoTotal": 3500,
      "fechaEmision": "2026-07-09T00:00:00.000Z",
      "enviadoEn": "2026-07-09T11:19:03.000Z",
      "createdAt": "2026-07-09T11:19:00.000Z",
      "urlVerificacion": "https://...",
      "urlPdf": "https://api.emitedo.com/emisiones/cmoet.../pdf",
      "urlXml": "https://api.emitedo.com/emisiones/cmoet.../xml"
    }
  ],
  "pagination": {
    "limit": 50,
    "count": 50,           // filas devueltas en esta página
    "orderBy": "fecha",
    "order": "desc",
    "hasMore": true,
    "nextCursor": "eyJ2IjoiMjAyNi0...", // solo keyset; null si no hay más
    "page": 2,             // solo modo offset
    "total": 95,           // solo modo offset
    "totalPages": 2        // solo modo offset
  }
}
```

Notas de campos:
- `montoTotal` es número.
- Fechas en ISO 8601 (UTC).
- `enviadoEn = null` → nunca se envió a DGII (emisión colgada).
- En **keyset** vienen `nextCursor`/`hasMore` (no `page`/`total`).
- En **offset** vienen `page`/`total`/`totalPages` (y `nextCursor` es `null`).

---

## 5. Cómo paginar en el front

### Opción A — Scroll infinito / "cargar más" (recomendado, eficiente)
Usar **cursor**. No requiere saber el total.

```js
let cursor = null;
async function loadMore() {
  const qs = new URLSearchParams({ limit: '50' });
  if (cursor) qs.set('cursor', cursor);
  const res = await api.get(`/contribuyentes/${cp}/emisiones?${qs}`);
  rows.push(...res.data);
  cursor = res.pagination.nextCursor;   // null cuando ya no hay más
  return res.pagination.hasMore;
}
```

### Opción B — Paginación con números de página
Usar **offset**. Da `total`/`totalPages` para pintar "Página 3 de 20".

```js
async function loadPage(page) {
  const res = await api.get(
    `/contribuyentes/${cp}/emisiones?page=${page}&limit=50`
  );
  render(res.data);
  paint({ page: res.pagination.page,
          totalPages: res.pagination.totalPages,
          total: res.pagination.total });
}
```

⚠️ Offset es más costoso en tablas grandes (COUNT + OFFSET). Preferir cursor cuando no se necesiten números de página.

### Cambiar orden

```
?orderBy=fecha&order=desc        // default: más recientes primero
?orderBy=secuencia&order=desc    // por eNcf descendente
```

El `cursor` es válido solo para el mismo `orderBy`/`order` con que se generó. Si el usuario cambia el orden, **reiniciar el cursor** (volver a pedir sin `cursor`).

### Filtrar

```
?estado=PENDIENTE          // solo pendientes
?estado=ACEPTADO&limit=100 // aceptadas, 100 por página
?formato=RFCE
```

---

## 6. Ejemplos curl

```bash
# Primera página, default (fecha desc, 50)
curl -H "x-api-key: $KEY" \
  "https://ecf-api.yisraeltech.com/contribuyentes/$CP/emisiones"

# Siguiente página (cursor del response anterior)
curl -H "x-api-key: $KEY" \
  "https://ecf-api.yisraeltech.com/contribuyentes/$CP/emisiones?cursor=eyJ2Ijoi..."

# Offset con números de página
curl -H "x-api-key: $KEY" \
  "https://ecf-api.yisraeltech.com/contribuyentes/$CP/emisiones?page=2&limit=25"

# Por secuencia, solo pendientes
curl -H "x-api-key: $KEY" \
  "https://ecf-api.yisraeltech.com/contribuyentes/$CP/emisiones?orderBy=secuencia&estado=PENDIENTE"
```

---

## 7. Archivos tocados (ecf-api)

| Archivo | Cambio |
|---|---|
| `src/emision/dto/list-emisiones-query.dto.ts` | **nuevo** — query params + validación |
| `src/emision/dto/emisiones-page.dto.ts` | **nuevo** — DTOs `EmisionResumenDto`, `EmisionesPageDto`, meta |
| `src/emision/emision.service.ts` | método `listEmisionesPage` + `EMISION_RESUMEN_SELECT` + helpers cursor |
| `src/emision/emision.controller.ts` | handler `list` paginado + mapper `toResumen` + Swagger |
| `src/emision/emision.service.spec.ts` | 7 tests nuevos |

**Tests:** 7 nuevos pasan; suite completa 933 pass (5 fallos preexistentes ajenos a este cambio: `certificate-validator`, `fe-dgii`, `contribuyentes`).
**Build:** OK.

---

## 8. Pendientes / no incluido en este commit

- **NO desplegado** — deploy a prod pendiente (noche 2026-07-14). Solo desde `main` tras merge.
- Ruido de prettier: un hook reformateó ~118 archivos del repo; **no** se commitearon, quedan fuera de este cambio.
- Hallazgos de la investigación DGII de Yisrael Kids School (contexto, no parte de este endpoint):
  - **Bug 1 — sin reintento RFCE:** si el envío a DGII se cuelga (reinicio/deploy/timeout), la emisión queda `PENDIENTE` con `enviadoEn=null` y sin reintento automático. Por eso el colegio tuvo que re-facturar manual (cada colgada tiene un reemplazo N+1 ya aceptado en DGII).
  - **Bug 2 — endpoint RFCE roto en SDK:** `getSummaryInvoiceInquiry` arma URL malformada (`/eCF//consultarfce`, `HPE_INVALID_CONSTANT`). La consulta que sí funciona es `inquiryStatus`.
  - Las 10 emisiones fantasma del colegio están confirmadas **NO registradas en DGII** (`"No encontrado"`); sus reemplazos +1 sí están. Se pueden limpiar sin riesgo.
