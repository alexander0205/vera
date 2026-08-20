-- Variantes por almacén (Opción B): el stock de cada variante vive por almacén,
-- consistente con product_almacen_stock del POS. Esta tabla es la FUENTE DE
-- VERDAD del stock de variantes; product_variants.stock_actual pasa a ser la
-- suma por todos los almacenes (denormalizada, para listados/alertas), y
-- products.stock_actual la suma de todas sus variantes.
--
-- Aditiva: no toca datos existentes. Los productos con variantes creados antes
-- de esta migración tienen su stock en product_variants.stock_actual (global);
-- al sembrarse aquí por almacén el conteo fino queda por almacén.

CREATE TABLE IF NOT EXISTS "product_variant_almacen_stock" (
  "id"           serial PRIMARY KEY,
  "team_id"      integer NOT NULL REFERENCES "teams"("id"),
  "variant_id"   integer NOT NULL REFERENCES "product_variants"("id"),
  "almacen_id"   integer NOT NULL REFERENCES "almacenes"("id"),
  "stock_actual" integer NOT NULL DEFAULT 0
);

-- Una fila por (variante, almacén). El descuento hace UPSERT sobre esta clave.
CREATE UNIQUE INDEX IF NOT EXISTS "pvas_variant_almacen_uniq"
  ON "product_variant_almacen_stock" ("variant_id", "almacen_id");
CREATE INDEX IF NOT EXISTS "pvas_team_idx"    ON "product_variant_almacen_stock" ("team_id");
CREATE INDEX IF NOT EXISTS "pvas_almacen_idx" ON "product_variant_almacen_stock" ("almacen_id");
