-- POS — Fase 3: código de barras por producto.
-- El lector USB teclea el código + Enter; el POS hace match exacto contra esta
-- columna (o contra referencia como respaldo) y agrega el producto al carrito.

ALTER TABLE "products"
  ADD COLUMN IF NOT EXISTS "codigo_barras" varchar(64);

CREATE INDEX IF NOT EXISTS "products_codigo_barras_idx"
  ON "products" ("team_id", "codigo_barras")
  WHERE "codigo_barras" IS NOT NULL;
