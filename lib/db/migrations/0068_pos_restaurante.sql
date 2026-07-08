-- POS — Modo Restaurante (capacidad componible por terminal)
--
-- El POS es UN solo sistema con capacidades que se prenden por terminal:
--   - monedero (colegio)  → ya existe vía la capa escolar
--   - mesas (restaurante) → esta migración
--
-- Molde igual al monedero: no es un "tipo" rígido, es una bandera. Una terminal
-- con mesas=true arranca en el grid de mesas; el resto (catálogo, cobro, e-CF,
-- inventario, caja, cierre Z, split, propina) es COMPARTIDO.
--
-- 1) pos_terminales.mesas — capacidad restaurante on/off por terminal.
-- 2) pos_meseros          — identidad ligera con PIN (pantalla compartida).
-- 3) mesas                — mesas físicas del salón (estado se deriva de comandas).
-- 4) comandas             — cuenta abierta por mesa (persistida server-side).
-- 5) comanda_items        — líneas de la comanda (editables hasta cobrar).

-- ── 1) capacidad por terminal ────────────────────────────────────────────────

ALTER TABLE "pos_terminales"
  ADD COLUMN IF NOT EXISTS "mesas" boolean NOT NULL DEFAULT false;

-- ── 2) pos_meseros ───────────────────────────────────────────────────────────
-- Identidad de mostrador compartido. No requiere cuenta de usuario: nombre + PIN.

CREATE TABLE IF NOT EXISTS "pos_meseros" (
  "id"         serial       PRIMARY KEY,
  "team_id"    integer      NOT NULL REFERENCES "teams"("id"),
  "nombre"     varchar(80)  NOT NULL,
  -- PIN corto (4–6 dígitos) para identificarse rápido en la pantalla compartida.
  "pin"        varchar(6)   NOT NULL,
  "activo"     boolean      NOT NULL DEFAULT true,
  "created_at" timestamp    NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS "pos_meseros_team_idx" ON "pos_meseros" ("team_id");
-- PIN único por equipo (mientras esté activo) para no ambiguar el login.
CREATE UNIQUE INDEX IF NOT EXISTS "pos_meseros_team_pin_uniq"
  ON "pos_meseros" ("team_id", "pin") WHERE "activo";

-- ── 3) mesas ─────────────────────────────────────────────────────────────────
-- El estado (libre/ocupada) NO se persiste: se deriva de si hay comanda abierta.

CREATE TABLE IF NOT EXISTS "mesas" (
  "id"         serial       PRIMARY KEY,
  "team_id"    integer      NOT NULL REFERENCES "teams"("id"),
  -- Terminal/estación a la que pertenece la mesa (define almacén de descuento).
  "terminal_id" integer     NOT NULL REFERENCES "pos_terminales"("id"),
  "nombre"     varchar(40)  NOT NULL,
  "zona"       varchar(40),
  "activo"     boolean      NOT NULL DEFAULT true,
  "created_at" timestamp    NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS "mesas_team_idx"     ON "mesas" ("team_id");
CREATE INDEX IF NOT EXISTS "mesas_terminal_idx" ON "mesas" ("terminal_id");

-- ── 4) comandas ──────────────────────────────────────────────────────────────
-- Cuenta abierta de una mesa. Vive minutos/horas y varios meseros la tocan, por
-- eso es server-side (no localStorage). Al cobrar se convierte en un e-CF.
--
-- estado: 'abierta' | 'cobrada' | 'cancelada'

CREATE TABLE IF NOT EXISTS "comandas" (
  "id"           serial      PRIMARY KEY,
  "team_id"      integer     NOT NULL REFERENCES "teams"("id"),
  "terminal_id"  integer     NOT NULL REFERENCES "pos_terminales"("id"),
  "mesa_id"      integer     NOT NULL REFERENCES "mesas"("id"),
  "mesero_id"    integer     REFERENCES "pos_meseros"("id"),
  -- Turno de caja en que se abrió (para el corte). Nullable por si aún sin turno.
  "turno_id"     integer     REFERENCES "caja_turnos"("id"),
  "estado"       varchar(12) NOT NULL DEFAULT 'abierta',
  -- e-CF emitido al cobrar (link para trazabilidad).
  "ecf_document_id" integer  REFERENCES "ecf_documents"("id"),
  "total_centavos" integer   NOT NULL DEFAULT 0,
  "created_at"   timestamp   NOT NULL DEFAULT NOW(),
  "updated_at"   timestamp   NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS "comandas_team_idx"     ON "comandas" ("team_id");
CREATE INDEX IF NOT EXISTS "comandas_mesa_idx"     ON "comandas" ("mesa_id");
-- Una sola comanda ABIERTA por mesa (red de seguridad ante carreras).
CREATE UNIQUE INDEX IF NOT EXISTS "comandas_mesa_abierta_uniq"
  ON "comandas" ("mesa_id") WHERE "estado" = 'abierta';

-- ── 5) comanda_items ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "comanda_items" (
  "id"             serial      PRIMARY KEY,
  "comanda_id"     integer     NOT NULL REFERENCES "comandas"("id") ON DELETE CASCADE,
  "producto_id"    integer     REFERENCES "products"("id"),
  "nombre"         varchar(200) NOT NULL,
  "precio_centavos" integer    NOT NULL,
  "qty"            integer     NOT NULL DEFAULT 1,
  -- Guardado como texto igual que el catálogo POS ('0.18' | '0.16' | '0' | 'exento').
  "tasa_itbis"     varchar(10) NOT NULL DEFAULT '0.18',
  "tipo"           varchar(10) NOT NULL DEFAULT 'bien',
  "descuento_pct"  integer     NOT NULL DEFAULT 0,
  "notas"          varchar(200),
  "created_at"     timestamp   NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS "comanda_items_comanda_idx" ON "comanda_items" ("comanda_id");
