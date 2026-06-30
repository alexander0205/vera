-- POS (punto de venta) — Fase 1: terminales + bandera de catálogo
--
-- 1) products.visible_pos — qué productos aparecen en la grilla del POS.
--    (la separación por punto de venta la da el almacén; esto excluye lo no
--     vendible en mostrador, p.ej. servicios.)
-- 2) pos_terminales — cada caja física es una entidad con config FIJA:
--    almacén (de dónde descuenta stock), impresora, lista de precios y el tipo
--    de comprobante por defecto. El cajero no elige nada al abrir: ya viene pegado.
-- 3) caja_turnos.terminal_id — ata el turno a la terminal en que se abrió.

-- ── 1) products ──────────────────────────────────────────────────────────────

ALTER TABLE "products"
  ADD COLUMN IF NOT EXISTS "visible_pos" boolean NOT NULL DEFAULT true;

-- ── 2) pos_terminales ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "pos_terminales" (
  "id"               serial      PRIMARY KEY,
  "team_id"          integer     NOT NULL REFERENCES "teams"("id"),
  "nombre"           varchar(100) NOT NULL,
  -- Almacén FIJO del que esta caja vende y descuenta stock.
  "almacen_id"       integer     NOT NULL REFERENCES "almacenes"("id"),
  -- Config fija opcional (si null, el POS usa el default del equipo).
  "impresora_id"     integer     REFERENCES "impresoras"("id"),
  "lista_precios_id" integer     REFERENCES "listas_precios"("id"),
  -- Tipo de comprobante por defecto al cobrar ('sin-ncf' ticket, o un e-CF).
  "tipo_ecf"         varchar(10) NOT NULL DEFAULT 'sin-ncf',
  "activo"           boolean     NOT NULL DEFAULT true,
  "created_at"       timestamp   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "pos_terminales_team_idx"    ON "pos_terminales" ("team_id");
CREATE INDEX IF NOT EXISTS "pos_terminales_almacen_idx" ON "pos_terminales" ("almacen_id");

-- ── 3) caja_turnos ───────────────────────────────────────────────────────────

ALTER TABLE "caja_turnos"
  ADD COLUMN IF NOT EXISTS "terminal_id" integer REFERENCES "pos_terminales"("id");

CREATE INDEX IF NOT EXISTS "caja_turnos_terminal_idx" ON "caja_turnos" ("terminal_id");

-- ── 4) teams: toggles del módulo POS ─────────────────────────────────────────

ALTER TABLE "teams"
  ADD COLUMN IF NOT EXISTS "pos_habilitado"         boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "pos_escolar_habilitado" boolean NOT NULL DEFAULT false;
