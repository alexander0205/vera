-- Recargo por mora automático (cobranza).
-- ARQUITECTURA OPCIÓN A: el recargo es dato de cobranza únicamente.
-- No se modifica el e-CF ya emitido (XML fiscal inmutable tras firma DGII).

-- ── Columnas en teams ────────────────────────────────────────────────────────

ALTER TABLE "teams"
  ADD COLUMN IF NOT EXISTS "recargo_mora_activo"      boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "recargo_mora_porcentaje"  integer NOT NULL DEFAULT 200,
  ADD COLUMN IF NOT EXISTS "recargo_mora_dias_gracia" integer NOT NULL DEFAULT 5;

-- ── Tabla recargos_mora ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "recargos_mora" (
  "id"                     serial PRIMARY KEY NOT NULL,
  "team_id"                integer NOT NULL REFERENCES "teams"("id"),
  "ecf_document_id"        integer NOT NULL REFERENCES "ecf_documents"("id"),
  "monto_centavos"         integer NOT NULL,
  "porcentaje_aplicado"    integer NOT NULL,
  "dias_gracia_aplicados"  integer NOT NULL,
  "base_saldo_centavos"    integer NOT NULL,
  "dias_vencido_al_aplicar" integer,
  "fecha_aplicacion"       timestamp DEFAULT now() NOT NULL,
  "created_by"             integer
);

-- Garantiza "una sola vez" por factura (idempotencia del cron)
CREATE UNIQUE INDEX IF NOT EXISTS "recargos_mora_ecf_document_unique"
  ON "recargos_mora" ("ecf_document_id");

CREATE INDEX IF NOT EXISTS "recargos_mora_team_idx"
  ON "recargos_mora" ("team_id");
