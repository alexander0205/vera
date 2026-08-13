-- Variantes de producto (MVP "global" + "por producto").
--
-- Un producto puede tener variantes (p.ej. una camisa con tallas M/L/XL). Cada
-- variante lleva su PROPIO stock — una sola cifra global, sin desglose por
-- almacén (eso queda para una fase posterior sin rehacer esto). Los ejes de
-- variante (Talla, Color, Sabor…) los define el usuario por producto y se
-- guardan como jsonb libre, así la estructura sirve para cualquier rubro.
--
-- Compatibilidad: los productos existentes quedan con variant_atributos = []
-- (sin variantes) y siguen usando products.stock_actual como hasta ahora. Nada
-- cambia para ellos hasta que se les definan variantes.

-- 1) Definición de ejes de variante por producto.
--    Formato: [{ "nombre": "Talla", "valores": ["M","L","XL"] }, ...]
ALTER TABLE "products"
  ADD COLUMN IF NOT EXISTS "variant_atributos" jsonb NOT NULL DEFAULT '[]'::jsonb;

-- 2) Tabla de variantes: cada fila es una combinación concreta con su stock.
CREATE TABLE IF NOT EXISTS "product_variants" (
  "id"            serial PRIMARY KEY,
  "team_id"       integer NOT NULL REFERENCES "teams"("id"),
  "product_id"    integer NOT NULL REFERENCES "products"("id"),
  -- Combinación de valores: { "Talla": "M", "Color": "Rojo" }
  "atributos"     jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- Display listo: "M" ó "Rojo · M"
  "nombre"        varchar(255) NOT NULL,
  "referencia"    varchar(100),
  "codigo_barras" varchar(64),
  -- precio NULL = hereda el precio del producto padre
  "precio"        integer,
  "costo"         integer NOT NULL DEFAULT 0,
  "stock_actual"  integer NOT NULL DEFAULT 0,
  "stock_minimo"  integer NOT NULL DEFAULT 0,
  "activo"        boolean NOT NULL DEFAULT true,
  "created_at"    timestamp NOT NULL DEFAULT now(),
  "updated_at"    timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "product_variants_team_idx"    ON "product_variants" ("team_id");
CREATE INDEX IF NOT EXISTS "product_variants_product_idx" ON "product_variants" ("team_id", "product_id");

-- Una combinación, una fila. Sin esto se pueden crear dos veces la "Talla M"
-- del mismo producto y el stock queda partido entre las dos sin que se note.
-- Parcial sobre activo: una variante dada de baja (soft-delete) no debe impedir
-- volver a crear esa misma combinación más adelante. jsonb normaliza el orden
-- de las llaves, así que {"Talla":"M"} compara igual sin importar cómo se envió.
CREATE UNIQUE INDEX IF NOT EXISTS "product_variants_combo_uniq"
  ON "product_variants" ("product_id", "atributos")
  WHERE "activo";

-- 3) La bitácora de inventario puede apuntar a una variante concreta.
--    NULL = movimiento a nivel producto (producto sin variantes).
ALTER TABLE "inventory_movements"
  ADD COLUMN IF NOT EXISTS "variant_id" integer REFERENCES "product_variants"("id");
