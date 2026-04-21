-- ─────────────────────────────────────────────────────────────────────────────
-- Migración 0014: Tabla `dgii_semilla` — caché global de semillas DGII
--
-- Una sola fila por ambiente (TesteCF / CerteCF / eCF).
-- La semilla es el challenge XML que emite la DGII; es pública (no contiene
-- info sensible) y puede ser firmada por cualquier empresa con su certificado.
-- Cachearla globalmente evita múltiples llamadas GET a la DGII cuando varios
-- teams re-autentican al mismo tiempo.
--
-- fecha_emision se guarda como TIMESTAMPTZ porque la DGII la emite con offset
-- -04:00 (hora de Santo Domingo / AST). Así sabemos exactamente cuándo la
-- emitió y cuándo expira, sin ambigüedad de zona horaria.
--
-- Para aplicar:
--   psql $POSTGRES_URL -f lib/db/migrations/0014_dgii_semilla.sql
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS dgii_semilla (
  id             SERIAL PRIMARY KEY,
  environment    VARCHAR(20) NOT NULL,
  semilla_xml    TEXT        NOT NULL,
  semilla_valor  TEXT        NOT NULL,
  -- TIMESTAMPTZ: preserva el offset -04:00 que devuelve la DGII
  fecha_emision  TIMESTAMPTZ NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT dgii_semilla_env_unique UNIQUE (environment)
);
