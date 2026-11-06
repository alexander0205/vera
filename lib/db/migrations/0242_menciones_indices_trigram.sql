-- 0242 · Menciones con @ en las tareas: índices trigram para buscar por nombre
-- de familia (clients.razon_social) y por número de comprobante (ecf_documents.encf).
--
-- CORRER SIN `-1` (ni dentro de ninguna transacción): CREATE INDEX CONCURRENTLY
-- no puede ir en una transacción. Una sentencia por vez, por ejemplo:
--   psql "$URL_SIN_POOLER" -f lib/db/migrations/0242_menciones_indices_trigram.sql
-- (sin -1 y sin --single-transaction). Usar la conexión SIN el pooler.
--
-- pg_trgm ya existe (0070/0071). Si un CONCURRENTLY falla a medias deja un
-- índice INVALID: borrarlo con DROP INDEX CONCURRENTLY y volver a correr.
-- Va antes o después del deploy: sin los índices la búsqueda funciona igual,
-- solo más lenta en colegios grandes.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX CONCURRENTLY IF NOT EXISTS clients_razon_social_trgm_idx
  ON clients USING gin (razon_social gin_trgm_ops);

CREATE INDEX CONCURRENTLY IF NOT EXISTS ecf_documents_encf_trgm_idx
  ON ecf_documents USING gin (encf gin_trgm_ops);

CREATE INDEX CONCURRENTLY IF NOT EXISTS ecf_documents_codigo_trgm_idx
  ON ecf_documents USING gin (codigo gin_trgm_ops);
