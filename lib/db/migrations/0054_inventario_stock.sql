-- P1+P2: Control de inventario — stock por producto + historial de movimientos
--
-- 1) Nuevas columnas en products:
--    · unidad_medida   — persiste el campo que ya existe en la UI pero no en DB
--    · costo           — costo de compra en centavos (margen y COGS)
--    · stock_actual    — unidades disponibles ahora
--    · stock_minimo    — umbral de alerta "bajo mínimo"
--    · controla_inventario    — solo bienes con control activo descuentan stock
--    · permite_venta_sin_stock — cuando false bloquea venta al llegar a 0
--
-- 2) Tabla inventory_movements — fuente de verdad de todos los movimientos

-- ── 1) products ──────────────────────────────────────────────────────────────

ALTER TABLE "products"
  ADD COLUMN IF NOT EXISTS "unidad_medida"             varchar(50)  NOT NULL DEFAULT 'Unidad',
  ADD COLUMN IF NOT EXISTS "costo"                     integer      NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "stock_actual"              integer      NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "stock_minimo"              integer      NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "controla_inventario"       boolean      NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "permite_venta_sin_stock"   boolean      NOT NULL DEFAULT true;

-- ── 2) inventory_movements ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "inventory_movements" (
  "id"                serial       PRIMARY KEY,
  "team_id"           integer      NOT NULL REFERENCES "teams"("id"),
  "producto_id"       integer      NOT NULL REFERENCES "products"("id"),

  -- VENTA | ENTRADA | AJUSTE_SALIDA | AJUSTE_ENTRADA | DEVOLUCION | STOCK_INICIAL
  "tipo"              varchar(20)  NOT NULL,

  -- Cantidad siempre positiva; es_entrada determina si suma o resta
  "cantidad"          integer      NOT NULL CHECK ("cantidad" > 0),
  "es_entrada"        boolean      NOT NULL,

  "stock_antes"       integer      NOT NULL,
  "stock_despues"     integer      NOT NULL,

  -- Referencia al documento que originó el movimiento (factura, nota de crédito)
  "referencia_id"     integer      REFERENCES "ecf_documents"("id"),
  "referencia_encf"   varchar(40),

  "motivo"            text,
  "created_by"        integer      REFERENCES "users"("id"),
  "created_at"        timestamp    NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "inv_mov_team_idx"     ON "inventory_movements" ("team_id");
CREATE INDEX IF NOT EXISTS "inv_mov_producto_idx" ON "inventory_movements" ("team_id", "producto_id");
CREATE INDEX IF NOT EXISTS "inv_mov_ref_idx"      ON "inventory_movements" ("referencia_id") WHERE "referencia_id" IS NOT NULL;
