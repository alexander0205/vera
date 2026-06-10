-- Módulo Cuadre de Caja — Paso 1b: turnos, movimientos y conciliación.
-- Modelo "una caja por cajero": cada usuario operativo abre/cierra su turno.
-- El esperado del cierre lo calcula el sistema a partir de pagos_recibidos
-- (efectivo) + movimientos de caja; el cajero solo ingresa el conteo físico.
-- Los descuadres exigen justificación + aprobación de admin/owner.

-- ── Tabla caja_turnos ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "caja_turnos" (
  "id"                        serial PRIMARY KEY NOT NULL,
  "team_id"                   integer NOT NULL REFERENCES "teams"("id"),
  "usuario_id"                integer NOT NULL REFERENCES "users"("id"),
  "estado"                    varchar(20) NOT NULL DEFAULT 'ABIERTO',
  -- Apertura (bloqueada tras confirmar)
  "monto_apertura_centavos"   integer NOT NULL,
  "apertura_por"              integer NOT NULL REFERENCES "users"("id"),
  "apertura_obs"              text,
  "apertura_at"               timestamp DEFAULT now() NOT NULL,
  -- Cierre
  "numero_cierre"             varchar(20),
  "efectivo_contado_centavos" integer,
  "monto_esperado_centavos"   integer,
  "diferencia_centavos"       integer,
  "cierre_obs"                text,
  "cierre_solicitado_at"      timestamp,
  -- Aprobación del descuadre
  "aprobado_por"              integer REFERENCES "users"("id"),
  "aprobado_at"               timestamp,
  "aprobacion_obs"            text,
  "created_at"                timestamp DEFAULT now() NOT NULL,
  "updated_at"                timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "caja_turnos_team_idx"
  ON "caja_turnos" ("team_id");
CREATE INDEX IF NOT EXISTS "caja_turnos_usuario_estado_idx"
  ON "caja_turnos" ("team_id", "usuario_id", "estado");

-- Un solo turno vivo (ABIERTO o CIERRE_SOLICITADO) por usuario a la vez.
CREATE UNIQUE INDEX IF NOT EXISTS "caja_turnos_usuario_abierto_uniq"
  ON "caja_turnos" ("usuario_id")
  WHERE "estado" IN ('ABIERTO', 'CIERRE_SOLICITADO');

-- ── Tabla caja_movimientos ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "caja_movimientos" (
  "id"             serial PRIMARY KEY NOT NULL,
  "team_id"        integer NOT NULL REFERENCES "teams"("id"),
  "turno_id"       integer NOT NULL REFERENCES "caja_turnos"("id"),
  "tipo"           varchar(20) NOT NULL,
  "monto_centavos" integer NOT NULL,
  "metodo"         varchar(30) NOT NULL DEFAULT 'efectivo',
  "descripcion"    text,
  "motivo"         text,
  "origen"         varchar(20) NOT NULL DEFAULT 'SISTEMA',
  "created_by"     integer REFERENCES "users"("id"),
  "created_at"     timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "caja_movimientos_turno_idx"
  ON "caja_movimientos" ("turno_id");

-- ── Counter de número de cierre (CC-YYYY-NNNNNN) ──────────────────────────────

CREATE TABLE IF NOT EXISTS "caja_cierre_counter" (
  "team_id" integer NOT NULL REFERENCES "teams"("id"),
  "anio"    smallint NOT NULL,
  "ultimo"  integer NOT NULL DEFAULT 0,
  CONSTRAINT "caja_cierre_counter_pk" PRIMARY KEY ("team_id", "anio")
);

-- ── FKs de conciliación en tablas existentes (nullable, no rompe legacy) ──────

ALTER TABLE "ecf_documents"
  ADD COLUMN IF NOT EXISTS "turno_caja_id" integer REFERENCES "caja_turnos"("id");

ALTER TABLE "pagos_recibidos"
  ADD COLUMN IF NOT EXISTS "turno_caja_id" integer REFERENCES "caja_turnos"("id");

CREATE INDEX IF NOT EXISTS "pagos_turno_idx"
  ON "pagos_recibidos" ("turno_caja_id");
