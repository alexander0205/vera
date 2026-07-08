-- POS — Fase 2: capa escolar. Monedero prepago del estudiante.
--
-- Exclusiva de colegios (teams.pos_escolar_habilitado). El padre/acudiente
-- recarga saldo al estudiante (un dependiente del cliente); el estudiante
-- consume contra ese saldo en el POS sin manejar efectivo. Límite diario
-- opcional. Todo movimiento queda en bitácora.

-- ── 1) monedero_estudiante ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "monedero_estudiante" (
  "id"                     serial    PRIMARY KEY,
  "team_id"                integer   NOT NULL REFERENCES "teams"("id"),
  "dependiente_id"         integer   NOT NULL REFERENCES "dependientes"("id") ON DELETE CASCADE,
  "saldo_centavos"         integer   NOT NULL DEFAULT 0,
  -- NULL = sin límite diario.
  "limite_diario_centavos" integer,
  "activo"                 boolean   NOT NULL DEFAULT true,
  "created_at"             timestamp NOT NULL DEFAULT NOW(),
  "updated_at"             timestamp NOT NULL DEFAULT NOW(),
  UNIQUE ("dependiente_id")
);

CREATE INDEX IF NOT EXISTS "monedero_team_idx" ON "monedero_estudiante" ("team_id");

-- ── 2) monedero_movimientos ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "monedero_movimientos" (
  "id"               serial    PRIMARY KEY,
  "team_id"          integer   NOT NULL REFERENCES "teams"("id"),
  "monedero_id"      integer   NOT NULL REFERENCES "monedero_estudiante"("id") ON DELETE CASCADE,
  -- RECARGA | CONSUMO | AJUSTE | REVERSA
  "tipo"             varchar(20) NOT NULL,
  "monto_centavos"   integer   NOT NULL CHECK ("monto_centavos" > 0),
  "es_entrada"       boolean   NOT NULL,
  "saldo_antes"      integer   NOT NULL,
  "saldo_despues"    integer   NOT NULL,
  -- Venta que originó el consumo (sin-ncf u otro e-CF).
  "referencia_ecf_id" integer  REFERENCES "ecf_documents"("id"),
  "motivo"           text,
  "created_by"       integer   REFERENCES "users"("id"),
  "created_at"       timestamp NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "monedero_mov_monedero_idx" ON "monedero_movimientos" ("monedero_id");
CREATE INDEX IF NOT EXISTS "monedero_mov_team_fecha_idx" ON "monedero_movimientos" ("team_id", "created_at");
