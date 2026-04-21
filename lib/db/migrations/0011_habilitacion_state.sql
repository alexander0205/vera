-- ─────────────────────────────────────────────────────────────────────────────
-- Migración 0011: Estado de habilitación DGII en la tabla teams
--
-- Agrega 2 columnas para persistir el progreso del wizard de habilitación
-- y el timestamp cuando se completó exitosamente la certificación.
--
-- Para aplicar:
--   npx dotenv -e .env -- psql $POSTGRES_URL -f lib/db/migrations/0011_habilitacion_state.sql
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE teams
  ADD COLUMN IF NOT EXISTS habilitacion_state TEXT,
  ADD COLUMN IF NOT EXISTS habilitacion_completado_at TIMESTAMP;
