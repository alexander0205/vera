# feature/qa-ambientes — Snapshot QA + Pagos Ledger + Per-tenant Ambiente

Branch creada **2026-05-30** desde `main` (`f54b302`).

Origen: stash de `main` con etiqueta `qa/ambientes: audit-logs, notes, dockerfile.dev, migraciones 0029/0030, mods facturas/pagos — 2026-05-28` + archivos untracked relacionados que estaban en el worktree al momento del stash.

Stash original sigue intacto (`stash@{0}` en main) — esta branch es la versión "parqueada" para retomar después sin chocar con `feature/dev-bootstrap`.

## Bloques de trabajo incluidos

### 1. Pagos como ledger (source of truth = `pagos_recibidos`)

- `lib/db/queries.ts`: nuevo `syncPagoMirror(teamId, docId)` — sincroniza el espejo inline `ecf_documents.pago*` desde la suma del ledger. Llamado tras cada insert/delete en `pagos_recibidos`.
- `app/api/facturas/[id]/pago/route.ts`: "pago único" del detalle → delete-replace en ledger + `syncPagoMirror`.
- `app/api/facturas/[id]/route.ts` y `app/api/facturas/route.ts`: campo `pagado` viene del ledger; fallback al inline para docs legacy (`GREATEST(ledger, inline)`).
- `app/api/pagos/route.ts`: GET/POST sobre `pagos_recibidos` via helpers.
- `app/api/ecf/emitir/route.ts`: al emitir/borrador, registra el pago inline en el ledger.
- `app/api/import/facturas/route.ts`: `ESTADO=Cobrada` (Alegra) → `registrarPago` full. Líneas en formato canónico `ItemLinea` (para que detalle/editar/emitir reconstruyan).
- `app/api/import/pagos/route.ts`: **eliminado** (import de recibos PDF Alegra retirado).
- `scripts/migrate-pagos-to-ledger.ts`: backfill `pagos_recibidos` desde `ecf_documents.pago*` legacy.

### 2. Audit log a nivel DB (triggers)

- `lib/db/migrations/0029_row_audit_log.sql`: tabla `row_audit_log` + triggers AFTER INSERT/UPDATE/DELETE en business tables.
- `lib/db/schema.ts`: define tabla `row_audit_log` (espejo del SQL para Drizzle).
- `lib/db/audit-context.ts`: contexto request → trigger (`actor`, `userId`, `teamId`, `ip`).
- `app/api/audit-logs/route.ts`: endpoint consulta.
- `scripts/apply-audit-migration.ts`: aplica la migration manual.
- `scripts/audit-smoke.ts`: smoke test de los triggers.

### 3. Notas por entidad

- `lib/db/migrations/0030_entity_notes.sql`: tabla `entity_notes`.
- `lib/db/schema.ts`: define tabla `entity_notes`.
- `app/api/notes/route.ts`: CRUD.
- `components/entity-notes.tsx`: UI reusable `<EntityNotes entityType="…" entityId={n} />`.
- `components/entity-history.tsx`: UI historial (usa `row_audit_log`).

### 4. Preflight DGII al emitir e-CF

- `app/api/facturas/[id]/emitir-ecf/route.ts`: valida por `tipoEcf` — RNC, razón social, NCF modificado, ITBIS permitido, regla DGII e32 ≥ DOP 250,000. Retorna `action: 'edit-factura' | 'complete-in-modal'` para guiar la UI.
- `app/(dashboard)/dashboard/facturas/[id]/page.tsx`: tabs Detalles/Notas/Historia. Mirror cliente del preflight. `RncSearch` para completar comprador al emitir. Alert "factura contado sin pago registrado" antes de DGII. Flag `esEcfReal` (E… + estado DGII) para distinguir e-CF real vs HISTORICA/borrador.
- `components/RncSearch.tsx`: ya existía — sin cambios.

### 5. Ambiente DGII per-tenant

- `app/api/sistema/ambiente/route.ts`: lee `contribuyentes.get(team.cp).ambiente` (ecf-api directo). Si la empresa no está registrada → fallback a `me().software.ambienteDefault`. Cambia al cambiar de empresa.
- `lib/dgii/catalogos.ts` + `lib/dgii/sync-catalogos.ts`: ambientes SIEMPRE desde ecf-api remoto, nunca de la DB local.
- `app/(dashboard)/dashboard/layout.tsx`: `mutateAmbiente()` al hacer team switch + tooltip badge actualizado.

### 6. UI varios

- `app/(dashboard)/dashboard/facturas/[id]/_pago-card.tsx`: confirmación antes de quitar pago + nuevos métodos (`tarjeta`, `deposito`, `otro`).
- `app/(dashboard)/dashboard/facturas/page.tsx`: columna "Saldo" → "Cobro" con pills (Pagada/Parcial/Pendiente/Vencida/Sin pago/Gratuita/Uso). Columna "Estado" → "Estado DGII".
- `app/(dashboard)/dashboard/facturas/nueva/NuevaFacturaForm.tsx` + `sections/TopBar.tsx`: marcador `'00'` → HISTORICA en edición; título dinámico Nueva/Editar.
- `app/(dashboard)/dashboard/cuentas-por-cobrar/page.tsx`: quita botón "Importar pagos (Alegra)".
- `components/import-modal.tsx`: soporta `format(value)` por columna.

### 7. Dev env

- `Dockerfile.dev`: Next 15.6+ con hot reload + seed Neon dump.
- `entrypoint.dev.sh`: espera Postgres, aplica dump si DB vacía, arranca `next dev`.
- `scripts/delete-facturas-by-rnc.ts`: limpieza de imports Alegra erróneos.

## Estado del build

Branch debería compilar — todos los imports referenciados (`@/components/entity-notes`, `entity-history`, `RncSearch`) están incluidos. **NO verificado con `pnpm build` aún.**

## Pendientes / próximos pasos

1. Correr `pnpm build` para confirmar que tipa.
2. Si las migrations 0029/0030 ya fueron aplicadas en la DB de dev, omitir; si no, `pnpm db:migrate` o `tsx scripts/apply-audit-migration.ts`.
3. Decidir si fusionar con `feature/dev-bootstrap` (probablemente NO — esto es feature work, no infra dev).
4. Revisar conflicto potencial con `feature/ecf-validation` (puede tener preflight similar).
5. `scripts/migrate-pagos-to-ledger.ts` — correr en QA antes de mergear a main para no romper el "pagado" de facturas legacy.

## Archivos NO incluidos a propósito

- `.env.dev`, `.env.vercel.tmp` — pueden contener secretos; quedan untracked en main worktree.
