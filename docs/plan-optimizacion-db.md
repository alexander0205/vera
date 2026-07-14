# Plan de Optimización de Base de Datos — emitedo-v2 + ecf-api

> **Instrucciones para el agente ejecutor:** Este plan es autocontenido. Ejecuta las fases en orden — cada fase es independiente, commiteable y verificable por separado. NO hagas deploy a producción ni corras migraciones en la DB de producción sin orden explícita del usuario. Al terminar cada fase: `npx tsc --noEmit` debe pasar limpio y debes reportar qué cambió.

## Contexto

Dos repos hermanos:

| Repo | Path | Stack | DB |
|---|---|---|---|
| **emitedo-v2** (app "Zero") | `/Users/alexanderferreras/Desktop/SolucionesDO/emitedo-v2` | Next.js 15.6 canary App Router + Drizzle ORM | Postgres Neon (`POSTGRES_URL` en `.env`) |
| **ecf-api** | `/Users/alexanderferreras/Desktop/SolucionesDO/ecf-api` | NestJS 11 + Prisma 6 | Postgres Neon (pooler) |

- emitedo-v2: migraciones Drizzle en `lib/db/migrations/` (última: `0069_reportes_rollups.sql`). Generar con `pnpm db:generate` (drizzle-kit) tras editar `lib/db/schema.ts`, o escribir SQL manual con el siguiente número (`0070_...`). Producción está en migración 0069.
- ecf-api: migraciones Prisma en `prisma/migrations/`. Generar con `npx prisma migrate dev --name <nombre>` tras editar `prisma/schema.prisma`.
- Problema global: Neon cobra por compute. El sistema tiene seq scans sobre tablas grandes, cero cache en 174 de 175 API routes, listados sin LIMIT, y re-autenticación DGII por operación. Este plan lo corrige por orden de ROI.

**Restricciones duras (NO violar):**
1. NO cambiar comportamiento funcional — solo performance. Toda respuesta de API debe mantener su shape (agregar paginación se hace con parámetros opcionales y defaults compatibles donde se indica).
2. NO tocar identidad DGII: `nombreSoftware:'EmiteDO'`, `SOFTWARE_NAME`, User-Agent `EmiteDO/1.0`, headers `X-EmiteDO-*`.
3. NO commitear `.env*` ni `node_modules`.
4. Migraciones: solo generarlas y probarlas contra la DB de desarrollo. Producción las corre el usuario.
5. Al dudar entre agresivo y conservador, elige conservador.

---

## FASE 1 — Quick wins sistémicos (emitedo-v2, ~4 archivos)

### 1.1 SWR global: apagar revalidate-on-focus
**Archivo:** `app/layout.tsx` (~línea 38-47, el `<SWRConfig>`).
El config global solo pasa `fallback`; SWR default `revalidateOnFocus: true` hace que cada alt-tab re-fetchee todos los hooks que no lo overridean. Agregar al value:
```tsx
<SWRConfig
  value={{
    revalidateOnFocus: false,
    dedupingInterval: 30_000,
    fallback: { /* ...lo existente sin tocar... */ }
  }}
>
```
Verificar que ningún hook dependa del focus-revalidate para funcionar (buscar `revalidateOnFocus: true` explícito — si existe, respetarlo).

### 1.2 Memoizar sesión con React.cache
**Archivo:** `lib/db/queries.ts`.
- `getUser()` (~línea 19) y `getTeamIdForUser()` (~línea 151) son funciones async normales. Envolverlas en `cache()` de React:
```ts
import { cache } from 'react';
export const getUser = cache(async () => { /* cuerpo actual sin cambios */ });
export const getTeamIdForUser = cache(async () => { /* cuerpo actual */ });
```
- `getTeamForUser()` (~línea 114) llama a `getUser()` internamente — con el cache por-request eso colapsa a 1 query.
- Efecto esperado: page-load pasa de ~5 queries de sesión a ~2. Patrón de referencia ya existente en el repo: `lib/auth/permissions.ts:39,74` usa `React.cache`.
- CUIDADO: `cache()` solo dedupe dentro del mismo request server-side. No cambia semántica.

### 1.3 Helper de auth para páginas de reportes (waterfall)
Las páginas `app/(dashboard)/dashboard/reportes/*/page.tsx` hacen 4-6 awaits secuenciales (`getUser` → `getTeamIdForUser` → member select → permiso → query). Con 1.2 aplicado, gran parte se dedupe solo. Adicional: en `ventas-generales/page.tsx` (~líneas 56-76) y las páginas `por-cliente|por-producto|por-tipo|por-usuario|por-usuario-pago|tendencia`, paralelizar lo paralelizable con `Promise.all` donde no haya dependencia de datos. No inventar un framework — cambios locales por página.

**Verificación fase 1:** `npx tsc --noEmit` limpio. Levantar dev (`pnpm dev`), navegar dashboard, confirmar que login/permisos/reportes funcionan igual.

---

## FASE 2 — Índices (emitedo-v2, 1 migración SQL)

Crear `lib/db/migrations/0070_perf_indexes.sql` (ajustar número si ya existe 0070) con **CREATE INDEX CONCURRENTLY** (la migración se correrá manualmente vía psql porque `CONCURRENTLY` no puede ir en transacción; documentarlo en comentario al inicio del archivo). Además reflejar los índices en `lib/db/schema.ts` (bloques de índices de cada tabla) para que drizzle-kit no los borre en futuras generaciones.

```sql
-- Correr manualmente vía psql (CONCURRENTLY no funciona dentro de transacción):
-- psql "$POSTGRES_URL" -f lib/db/migrations/0070_perf_indexes.sql

-- ecf_documents: reportes y dashboard filtran team_id + rango de fecha
CREATE INDEX CONCURRENTLY IF NOT EXISTS ecf_docs_team_fecha_idx
  ON ecf_documents (team_id, fecha_emision);
CREATE INDEX CONCURRENTLY IF NOT EXISTS ecf_docs_team_created_idx
  ON ecf_documents (team_id, created_at);

-- clients: FK no crea índice; listados filtran team_id y ordenan por razon_social
CREATE INDEX CONCURRENTLY IF NOT EXISTS clients_team_razon_idx
  ON clients (team_id, razon_social);

-- pagos_recibidos: las subqueries de saldo filtran SOLO ecf_document_id;
-- el índice existente (team_id, ecf_document_id) no aplica
CREATE INDEX CONCURRENTLY IF NOT EXISTS pagos_ecf_doc_idx
  ON pagos_recibidos (ecf_document_id);

-- rnc_padron (~780k filas): búsqueda por nombre con ILIKE '%q%'
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX CONCURRENTLY IF NOT EXISTS rnc_padron_nombre_trgm_idx
  ON rnc_padron USING gin (nombre gin_trgm_ops);
CREATE INDEX CONCURRENTLY IF NOT EXISTS rnc_padron_rnc_trgm_idx
  ON rnc_padron USING gin (rnc gin_trgm_ops);
```

Antes de escribir la migración: leer `lib/db/schema.ts` y `lib/db/migrations/0025|0036|0038|0046|0048` para confirmar nombres exactos de tablas/columnas e índices existentes (no duplicar). Verificar el nombre real de la columna de nombre comercial en `rnc_padron` (migración `0004`) y agregar índice trigram también si la búsqueda la usa (ver `app/api/rnc/search/route.ts`).

**Verificación fase 2:** correr contra DB de desarrollo. `EXPLAIN ANALYZE` de: (a) query del dashboard stats, (b) `/api/rnc/search?q=palabra`, (c) subquery de pagado en CxC — confirmar index scan en vez de seq scan.

---

## FASE 3 — Endpoint público peligroso `/api/rnc/search` (emitedo-v2)

**Archivo:** `app/api/rnc/search/route.ts`.
Estado actual: público, sin rate-limit, sin cache, ILIKE sobre 780k filas. Cambios:
1. **Auth:** requerir sesión (usar el guard que usan las demás rutas — ver `lib/auth/api-guard.ts` / patrón de rutas vecinas). El padrón RNC se usa desde el formulario de facturación/clientes con usuario logueado; verificar consumidores con grep `rnc/search` en `app/` y `components/` antes de decidir. Si hay consumo público legítimo (landing), dejar sin auth pero con rate-limit agresivo.
2. **Rate-limit:** aplicar `rateLimit()` de `lib/rate-limit.ts` (in-memory basta como primera línea).
3. **Cache HTTP:** el padrón cambia 1 vez/día (cron 4am). Responder con `Cache-Control: public, max-age=3600, stale-while-revalidate=86400` (patrón de referencia: `app/api/catalogos/[tipo]/route.ts`).
4. **Query:** mínimo `q` de 3 caracteres, `.limit(20)`.
5. Los índices trigram de la Fase 2 hacen el ILIKE indexable.

---

## FASE 4 — Listados sin LIMIT + payloads (emitedo-v2)

Patrón de referencia para paginación server-side: `app/api/facturas/route.ts` (acepta `limit`/`offset`) + `app/(dashboard)/dashboard/facturas/page.tsx` (pasa prop `pagination` a `components/data-table.tsx`, que ya la soporta — línea ~240 hace slice client-side solo cuando NO recibe la prop).

Para cada endpoint, mantener compatibilidad: si el cliente no manda `limit`, usar default generoso (500) para no romper consumidores existentes; la UI se actualiza en el mismo PR para mandar `limit=50&offset=N`.

| Endpoint | Archivo API | Cambios |
|---|---|---|
| Clientes | `app/api/clientes/route.ts` (~línea 22) | `.limit()`/`.offset()` + búsqueda `q` en SQL (con trigram de Fase 2). UI: `app/(dashboard)/dashboard/clientes/_page-client.tsx` → prop `pagination` |
| Productos | `app/api/productos/route.ts` (~línea 65) | **Excluir columna `imagen` (base64 hasta 1.5MB/fila) del listado** — proyección explícita de columnas. El detalle (`[id]`) sigue devolviendo imagen. + limit/offset. UI: `productos/_page-client.tsx` |
| Pagos | `app/api/pagos/listado/route.ts` → `getPagosListado` en `lib/db/queries.ts` (~línea 670) | `.limit()` + paginación; documentar que filtros pasan a SQL |
| Cuentas por cobrar | `app/api/cuentas-por-cobrar/route.ts` → `getCuentasPorCobrar` en `lib/db/queries.ts` (~líneas 496-611) | `.limit()`/`.offset()`. Las 3 subqueries correlacionadas por fila (`pagado`, `moraSaldo`, `ncAplicado`) quedan aceptables una vez exista el índice `pagos_ecf_doc_idx` (Fase 2) y el row-count esté acotado. NO reescribir la lógica de saldos — riesgo alto, poco beneficio con LIMIT |
| Cotizaciones (bug) | `app/api/cotizaciones/route.ts` | Bug funcional: `.limit(100)` y luego filtra `q` en JS → la búsqueda ignora todo después de la fila 100. Mover el filtro `q` al WHERE SQL |
| Export facturas | `app/api/facturas/export/route.ts` (~línea 64) | Subquery correlacionada de pagos POR FILA × hasta 5000 → reemplazar con `LEFT JOIN pagos_recibidos ... GROUP BY` |
| Notas crédito/débito (server pages) | `app/(dashboard)/dashboard/notas-credito/page.tsx:7-12` y `notas-debito/page.tsx:7-12` | Cargan `getEcfDocuments(teamId, 500)` y filtran a solo notas en JS. Filtrar por `tipo_ecf IN ('34','33')` en la query (agregar parámetro de tipos a `getEcfDocuments` o query dedicada) |

**Verificación fase 4:** cada pantalla lista/busca/pagina igual que antes. Probar con team que tenga datos (DB dev).

---

## FASE 5 — Cache de lecturas repetidas (emitedo-v2)

Patrón de referencia existente: `app/api/catalogos/[tipo]/route.ts` (`revalidate` + `Cache-Control`).

1. **Catálogos por team** (cambian poco, se leen mucho): `almacenes`, `categorias`, `vendedores`, `listas-precios`, `maestros`, `secuencias`, `impresoras`, `inventario/almacen-stock`. Son datos por-tenant → NO usar `Cache-Control: public`. Usar `unstable_cache` de Next con key que incluya `teamId` y tag por recurso, revalidando el tag en las mutaciones (POST/PUT/DELETE del mismo recurso con `revalidateTag`). Si el esfuerzo de invalidación en todas las mutaciones es alto, alternativa mínima: `Cache-Control: private, max-age=60` en los GET.
2. **Dashboard stats** (`getDashboardStats`, `lib/db/queries.ts:253-311`): envolver en `unstable_cache` con TTL 60s + key por team. El COUNT total sin filtro de fecha crece para siempre — cambiarlo a COUNT del año en curso si la UI lo permite (verificar qué muestra `app/(dashboard)/dashboard/page.tsx` antes).
3. **Caja polling** (`app/(dashboard)/dashboard/caja/page.tsx:438` — `setInterval 15s` → `/api/caja/turnos` = ~7 queries/poll): (a) subir a 30s, (b) en el endpoint `app/api/caja/turnos/route.ts` consolidar las queries del `Promise.all` en menos round-trips y agregar `.limit()` al select de movimientos. NO implementar websockets — fuera de alcance.

---

## FASE 6 — POS (emitedo-v2)

**Archivo:** `app/pos/_pos-client.tsx` (2284 líneas — leer las zonas citadas antes de tocar).
1. **ClientePicker** (~líneas 1270-1286): hace `fetch('/api/clientes')` completo al montar y filtra client-side; está montado 2 veces (panel desktop línea ~907 + sheet móvil ~949). Cambiar a búsqueda server-side con debounce (300ms, patrón de `RncSearch.tsx:117`) usando el `q` + `limit=20` de la Fase 4. Elevar el estado/fetch a un solo lugar (el padre `CarritoPanel`) para no duplicar.
2. **Catálogo tras cada venta** (~líneas 309-324, 683, 689): `cargarCatalogo(true)` re-trae el catálogo completo después de CADA venta solo para refrescar stock. Crear endpoint ligero `GET /api/pos/stock?ids=1,2,3` que devuelva solo `{productoId, stock}` de los productos vendidos, y usarlo post-venta. El catálogo completo solo se recarga al cambiar `listaPreciosId` o manualmente.

**Verificación fase 6:** flujo POS completo en dev: abrir POS, buscar cliente, vender, confirmar stock actualizado en grid.

---

## FASE 7 — ecf-api (repo `/Users/alexanderferreras/Desktop/SolucionesDO/ecf-api`)

### 7.1 `/status` público con 10k filas (CRÍTICO)
**Archivo:** `src/health/status.controller.ts` (~líneas 108-125).
`findMany({take: 10_000})` de `audit_logs` + percentiles en JS, por hit, sin auth. Reemplazar con agregación SQL vía `prisma.$queryRaw`:
```sql
SELECT count(*)::int AS total,
       avg(duration_ms)::float AS avg_ms,
       percentile_cont(0.5) WITHIN GROUP (ORDER BY duration_ms) AS p50,
       percentile_cont(0.95) WITHIN GROUP (ORDER BY duration_ms) AS p95,
       count(*) FILTER (WHERE status_code >= 500)::int AS errores
FROM audit_logs WHERE created_at >= now() - interval '24 hours';
```
(Verificar nombres de columnas reales en `prisma/schema.prisma`.) Además cachear el resultado in-memory 60s (variable módulo con timestamp, mismo patrón que el token cache del repo).

### 7.2 Usar el cache de token DGII en paths calientes
`DgiiAuthService` ya tiene `tokenCache` (TTL con margen 5 min) pero solo lo usa `dgii-status.controller`. Los paths calientes crean cliente nuevo y llaman `client.authenticate()` (= semilla + firma + token, 2 roundtrips DGII) por CADA operación:
- `src/emision/emision.service.ts` ~líneas 338, 653, 1225
- `src/emision/emision-status-poller.service.ts` ~línea 149
- `src/recepcion/recepcion.service.ts` ~línea 229
- `src/anecf/anecf.service.ts` ~línea 115

Refactor: exponer en `DgiiAuthService` un método `getAuthenticatedClient(rnc, ambiente)` que devuelva cliente con token cacheado (reutilizando su `tokenCache`), y reemplazar los `authenticate()` directos. Leer primero cómo `dgii-status.controller` consume el cache para replicar el patrón exacto. CUIDADO: el token es por RNC+ambiente — la key del cache debe incluir ambos.

### 7.3 Poller de estados: acotar + no solapar
**Archivo:** `src/emision/emision-status-poller.service.ts` (~líneas 75-192).
1. `findMany` de pendientes (línea ~88): agregar `take: 50, orderBy: { enviadoEn: 'asc' }`.
2. Guard de reentrada: flag `private running = false` al inicio del tick; si ya corre, skip (NestJS cron no bloquea solapamientos).
3. El loop usa el cliente cacheado de 7.2 (elimina el authenticate por emisión).
4. Índice Prisma: en `prisma/schema.prisma`, modelo de emisiones, agregar `@@index([estado, enviadoEn])` + `npx prisma migrate dev --name perf_poller_index`.

### 7.4 `estado-dgii` servir desde DB
**Archivo:** `src/emision/emision.service.ts` (~líneas 1182-1258) + `src/emision/emision.controller.ts` (~líneas 147-162).
`GET /emisiones/:id/estado-dgii` (lo que emitedo-v2 pollea vía `/api/ecf/estado`) hoy consulta DGII en vivo por cada hit no-final, duplicando el trabajo del poller. Cambiar a: responder el estado persistido en DB siempre; consultar DGII en vivo SOLO si `?live=true` (query param). Coordinar: en emitedo-v2, `app/api/ecf/estado/route.ts` NO manda `live` → automáticamente deja de provocar consultas DGII. El botón manual "consultar estado" de la UI de emitedo (buscar consumidor con grep) puede mandar `live=true`.

### 7.5 Cache de contribuyente
**Archivo:** `src/contribuyentes/contribuyentes.service.ts` (~líneas 146-178).
`findByCodigoPublico`/`findByRnc` = 1 `findUnique` por request, sin cache pese a que la config casi nunca cambia. Agregar cache in-memory TTL 60s (mismo patrón que `api-key.guard.ts`), invalidando en `update`/`softDelete` del mismo service.

### 7.6 Audit log: retención + bug
**Archivo:** `src/common/interceptors/http-logging.interceptor.ts` (~líneas 243-275).
1. Crear cron real de retención (nuevo provider con `@Cron` diario, p.ej. 3am): `DELETE FROM audit_logs WHERE created_at < now() - interval '90 days'` (el SQL ya está documentado como comentario ~línea 66 — implementarlo).
2. Bug: el interceptor lee `req.caller` pero el guard setea `req.apiKey` → `empresaId` sale null en el audit. Alinear el nombre del campo (verificar en `api-key.guard.ts` qué setea exactamente).

### 7.7 Listados entrantes sin blobs
**Archivo:** `src/recepcion/incoming.controller.ts` (~líneas 46-50, 91-95).
`findMany` con `take:200` pero sin `select` → arrastra `xmlRecibido`/`xmlFirmado`/`arecfXml` completos (varios MB por página). Agregar `select` con solo columnas de resumen (id, rnc, encf, tipo, estado, fechas, montos). El detalle `:id` ya devuelve el XML.

### 7.8 Métricas support en SQL
**Archivo:** `src/support/support.service.ts` (~líneas 253-265). `findMany` sin take + agregación JS → `prisma.count`/`groupBy` por estado + agregados SQL.

**Verificación fase 7:** `npm run build` (o el script de build del repo) limpio. Levantar local si hay config disponible; si no, tests unitarios existentes + revisión de tipos.

---

## FASE 8 — Item diferido (requiere decisión del usuario, NO ejecutar sin preguntar)

- **N+1 en `syncPagoMirror`** (`lib/db/queries.ts:1131-1134`, ~5N queries al pagar factura con N moras): es ruta de escritura de dinero — riesgo alto. Solo batchear si el usuario lo pide explícitamente.
- **Websockets/SSE para caja y POS:** fuera de alcance de este plan.
- **`connection_limit` explícito en Prisma (ecf-api):** depende del plan de Neon y del pooler — preguntar al usuario los límites antes de fijar un número.

---

## Orden de ejecución y entrega

1. Fases 1→6 en emitedo-v2: UNA rama nueva desde `main` (p.ej. `perf/db-optimization`), un commit por fase, `tsc --noEmit` limpio en cada uno.
2. Fase 7 en ecf-api: rama propia en ese repo (revisar su convención de branches con `git log`), un commit por sub-item o agrupados 7.1-7.4 y 7.5-7.8.
3. La migración SQL de Fase 2 y la de Prisma (7.3) se ENTREGAN pero no se corren en producción — el usuario decide cuándo.
4. El punto 7.4 tiene dependencia cruzada: se puede desplegar ecf-api primero (el param `live` es opt-in, default compatible).
5. Reporte final: tabla fase | archivos tocados | verificación hecha | pendientes.

## Qué NO tocar (ya está bien)

- `facturas` (paginado), MV `mv_reportes_ventas_lineas` + cron 6h, crons con `CRON_SECRET`, debounces 300ms existentes, imports chunkeados.
- ecf-api: cache de API keys, cache de certificados P12, `assignNext` de NCF (CAS con retry).
- Identidad DGII y headers `X-EmiteDO-*` (restricción dura #2).
