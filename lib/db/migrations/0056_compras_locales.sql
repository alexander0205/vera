-- Migration 0048: Compras locales (registro manual de entradas de inventario)

CREATE TABLE IF NOT EXISTS "compras_locales" (
  "id"                serial PRIMARY KEY,
  "team_id"           integer NOT NULL REFERENCES "teams"("id"),
  "proveedor_rnc"     varchar(20),
  "proveedor_nombre"  varchar(255),
  "fecha"             date NOT NULL DEFAULT CURRENT_DATE,
  "referencia_encf"   varchar(40),   -- e-NCF del proveedor si viene de e-CF recibido
  "notas"             text,
  "monto_total"       integer NOT NULL DEFAULT 0,  -- centavos (suma de items)
  "created_by"        integer REFERENCES "users"("id"),
  "created_at"        timestamp NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS "compras_locales_items" (
  "id"              serial PRIMARY KEY,
  "compra_id"       integer NOT NULL REFERENCES "compras_locales"("id") ON DELETE CASCADE,
  "producto_id"     integer NOT NULL REFERENCES "products"("id"),
  "almacen_id"      integer REFERENCES "almacenes"("id"),
  "cantidad"        integer NOT NULL CHECK ("cantidad" > 0),
  "costo_unitario"  integer NOT NULL DEFAULT 0   -- centavos
);

CREATE INDEX IF NOT EXISTS "idx_compras_locales_team"  ON "compras_locales"("team_id");
CREATE INDEX IF NOT EXISTS "idx_compras_locales_items" ON "compras_locales_items"("compra_id");
