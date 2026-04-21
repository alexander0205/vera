-- ─────────────────────────────────────────────────────────────────────────────
-- Migración 0012: Agregar provincia + municipio al perfil de la empresa.
--
-- El formulario de habilitación ya los pedía y enviaba, pero el schema
-- no tenía columnas donde guardarlos — se perdían silenciosamente.
--
-- Para aplicar:
--   psql $POSTGRES_URL -f lib/db/migrations/0012_teams_provincia_municipio.sql
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE teams
  ADD COLUMN IF NOT EXISTS provincia VARCHAR(100),
  ADD COLUMN IF NOT EXISTS municipio VARCHAR(100);
