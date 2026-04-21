-- ─────────────────────────────────────────────────────────────────────────────
-- Migración 0009: Seguridad — cifrado de certificados + audit log + rate limits
-- ─────────────────────────────────────────────────────────────────────────────
-- Para aplicar:
--   psql $POSTGRES_URL -f lib/db/migrations/0009_security.sql
-- O con dotenv-cli:
--   npx dotenv -e .env -- psql $POSTGRES_URL -f lib/db/migrations/0009_security.sql
--
-- DESPUÉS de aplicar esta migración:
--   1. Agrega CERT_MASTER_KEY a tu .env y a Vercel
--   2. Ejecuta:  npx dotenv -e .env -- npx tsx scripts/migrate-certs.ts
--      Eso cifra los certs existentes y anula certP12/certPassword/dgiiToken.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── teams: columnas de certificado cifrado ────────────────────────────────────
ALTER TABLE teams
  ADD COLUMN IF NOT EXISTS cert_p12_ciphered  TEXT,
  ADD COLUMN IF NOT EXISTS cert_p12_iv        TEXT,
  ADD COLUMN IF NOT EXISTS cert_p12_auth_tag  TEXT,
  ADD COLUMN IF NOT EXISTS cert_pin_ciphered  TEXT,
  ADD COLUMN IF NOT EXISTS cert_pin_iv        TEXT,
  ADD COLUMN IF NOT EXISTS cert_pin_auth_tag  TEXT,
  ADD COLUMN IF NOT EXISTS cert_titular       TEXT,
  ADD COLUMN IF NOT EXISTS cert_serial        TEXT,
  ADD COLUMN IF NOT EXISTS cert_vencimiento   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS dgii_token_ciphered  TEXT,
  ADD COLUMN IF NOT EXISTS dgii_token_iv        TEXT,
  ADD COLUMN IF NOT EXISTS dgii_token_auth_tag  TEXT;

-- ── audit_logs ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS audit_logs (
  id          SERIAL PRIMARY KEY,
  team_id     INTEGER REFERENCES teams(id),
  user_id     INTEGER REFERENCES users(id),
  actor       TEXT NOT NULL,
  action      VARCHAR(50) NOT NULL,
  resource    TEXT,
  ip_address  VARCHAR(45),
  metadata    TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS audit_logs_team_idx    ON audit_logs(team_id);
CREATE INDEX IF NOT EXISTS audit_logs_action_idx  ON audit_logs(action);
CREATE INDEX IF NOT EXISTS audit_logs_created_idx ON audit_logs(created_at);

-- ── rate_limits ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS rate_limits (
  key       TEXT PRIMARY KEY,
  count     INTEGER NOT NULL DEFAULT 1,
  reset_at  TIMESTAMPTZ NOT NULL
);
