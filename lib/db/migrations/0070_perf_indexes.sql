-- 0070_perf_indexes — Índices de performance (auditoría DB 2026-07)
--
-- ⚠️ APLICAR MANUALMENTE, NO por drizzle-kit migrate:
--     psql "$POSTGRES_URL" -f lib/db/migrations/0070_perf_indexes.sql
--
-- Usa CREATE INDEX CONCURRENTLY (no bloquea escrituras) — NO puede correr dentro
-- de una transacción, por eso va fuera del runner transaccional. Idempotente
-- (IF NOT EXISTS): seguro re-ejecutar. En una tabla grande cada índice tarda.
--
-- El journal de drizzle está congelado en 0004; las migraciones 0005+ se aplican
-- manualmente en este repo, así que este archivo sigue esa misma convención.

-- ── ecf_documents (tabla más grande) ────────────────────────────────────────
-- Todos los reportes y el dashboard filtran team_id + rango de fecha; sin estos
-- índices es seq scan de la tabla completa en cada carga.
CREATE INDEX CONCURRENTLY IF NOT EXISTS ecf_docs_team_fecha_idx
  ON ecf_documents (team_id, fecha_emision);

CREATE INDEX CONCURRENTLY IF NOT EXISTS ecf_docs_team_created_idx
  ON ecf_documents (team_id, created_at);

-- ── clients ──────────────────────────────────────────────────────────────────
-- El FK team_id no crea índice en Postgres. Listados/autocompletes filtran
-- team_id y ordenan por razon_social.
CREATE INDEX CONCURRENTLY IF NOT EXISTS clients_team_razon_idx
  ON clients (team_id, razon_social);

-- ── pagos_recibidos ──────────────────────────────────────────────────────────
-- Las subqueries de saldo (cuentas por cobrar, aging, notas de crédito) filtran
-- SOLO por ecf_document_id. El índice existente (team_id, ecf_document_id) lidera
-- con team_id → no es usable para ese predicado. Este índice standalone sí.
CREATE INDEX CONCURRENTLY IF NOT EXISTS pagos_ecf_doc_idx
  ON pagos_recibidos (ecf_document_id);

-- ── rnc_padron (~780k filas) ─────────────────────────────────────────────────
-- Búsqueda del padrón por nombre con ILIKE '%q%' hacía seq scan por cada tecla.
-- Trigram GIN vuelve indexable ILIKE (contains y prefix). Cubre nombre,
-- nombre_comercial y rnc (ILIKE prefix sobre rnc no usa el btree del PK).
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX CONCURRENTLY IF NOT EXISTS rnc_padron_nombre_trgm_idx
  ON rnc_padron USING gin (nombre gin_trgm_ops);

CREATE INDEX CONCURRENTLY IF NOT EXISTS rnc_padron_nombre_comercial_trgm_idx
  ON rnc_padron USING gin (nombre_comercial gin_trgm_ops);

CREATE INDEX CONCURRENTLY IF NOT EXISTS rnc_padron_rnc_trgm_idx
  ON rnc_padron USING gin (rnc gin_trgm_ops);
