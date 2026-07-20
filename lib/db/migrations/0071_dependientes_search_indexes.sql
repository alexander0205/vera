-- 0071_dependientes_search_indexes — Índices para búsqueda de clientes por beneficiario
--
-- ⚠️ APLICAR MANUALMENTE, NO por drizzle-kit migrate:
--     psql "$POSTGRES_URL" -f lib/db/migrations/0071_dependientes_search_indexes.sql
--
-- Misma convención que 0070: CREATE INDEX CONCURRENTLY fuera del runner
-- transaccional, idempotente (IF NOT EXISTS), seguro re-ejecutar.
--
-- GET /api/clientes?q= ahora matchea también por dependiente (en colegios se busca
-- al acudiente por el nombre del hijo). Eso corre ILIKE '%q%' sobre
-- dependientes.nombre/apellido en cada tecleo; sin trigram es seq scan.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX CONCURRENTLY IF NOT EXISTS dependientes_nombre_trgm_idx
  ON dependientes USING gin (nombre gin_trgm_ops);

CREATE INDEX CONCURRENTLY IF NOT EXISTS dependientes_apellido_trgm_idx
  ON dependientes USING gin (apellido gin_trgm_ops);

-- El EXISTS correlaciona por client_id y filtra por team_id; dependientes_client_idx
-- (0033) solo cubre client_id.
CREATE INDEX CONCURRENTLY IF NOT EXISTS dependientes_team_client_idx
  ON dependientes (team_id, client_id);
