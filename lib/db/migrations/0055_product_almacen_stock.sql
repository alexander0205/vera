-- Migration 0047: Stock por almacén (tabla pivot)

CREATE TABLE IF NOT EXISTS "product_almacen_stock" (
  "id"           serial PRIMARY KEY,
  "team_id"      integer NOT NULL REFERENCES "teams"("id"),
  "product_id"   integer NOT NULL REFERENCES "products"("id") ON DELETE CASCADE,
  "almacen_id"   integer NOT NULL REFERENCES "almacenes"("id") ON DELETE CASCADE,
  "stock_actual" integer NOT NULL DEFAULT 0,
  UNIQUE ("product_id", "almacen_id")
);

CREATE INDEX IF NOT EXISTS "idx_product_almacen_stock_team"    ON "product_almacen_stock"("team_id");
CREATE INDEX IF NOT EXISTS "idx_product_almacen_stock_almacen" ON "product_almacen_stock"("almacen_id");
