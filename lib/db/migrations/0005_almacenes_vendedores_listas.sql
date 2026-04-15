-- Migration 0005: Almacenes, Vendedores y Listas de Precios

-- Almacenes (ubicaciones de inventario / sucursales)
CREATE TABLE IF NOT EXISTS "almacenes" (
  "id"          serial PRIMARY KEY,
  "team_id"     integer NOT NULL REFERENCES "teams"("id"),
  "nombre"      varchar(255) NOT NULL,
  "direccion"   varchar(500),
  "observacion" text,
  "es_default"  varchar(5) NOT NULL DEFAULT 'false',
  "created_at"  timestamp NOT NULL DEFAULT now()
);

-- Vendedores (entidad propia, no necesariamente usuario del sistema)
CREATE TABLE IF NOT EXISTS "vendedores" (
  "id"             serial PRIMARY KEY,
  "team_id"        integer NOT NULL REFERENCES "teams"("id"),
  "nombre"         varchar(255) NOT NULL,
  "identificacion" varchar(100),
  "observacion"    text,
  "activo"         varchar(5) NOT NULL DEFAULT 'true',
  "created_at"     timestamp NOT NULL DEFAULT now()
);

-- Listas de precios
CREATE TABLE IF NOT EXISTS "listas_precios" (
  "id"           serial PRIMARY KEY,
  "team_id"      integer NOT NULL REFERENCES "teams"("id"),
  "nombre"       varchar(255) NOT NULL,
  "tipo"         varchar(10) NOT NULL DEFAULT 'valor',  -- 'valor' | 'porcentaje'
  "porcentaje"   integer NOT NULL DEFAULT 0,            -- basis points (1100 = 11.00%)
  "es_descuento" varchar(5) NOT NULL DEFAULT 'true',    -- 'true' = descuento, 'false' = recargo
  "descripcion"  text,
  "es_default"   varchar(5) NOT NULL DEFAULT 'false',
  "created_at"   timestamp NOT NULL DEFAULT now()
);

-- Precios por producto dentro de una lista (solo para tipo='valor')
CREATE TABLE IF NOT EXISTS "listas_precios_items" (
  "id"               serial PRIMARY KEY,
  "lista_precios_id" integer NOT NULL REFERENCES "listas_precios"("id") ON DELETE CASCADE,
  "producto_id"      integer NOT NULL REFERENCES "products"("id") ON DELETE CASCADE,
  "precio"           integer NOT NULL DEFAULT 0,  -- centavos (DOP * 100)
  UNIQUE("lista_precios_id", "producto_id")
);

-- Columnas extra en ecf_documents
ALTER TABLE "ecf_documents"
  ADD COLUMN IF NOT EXISTS "almacen_id"      integer REFERENCES "almacenes"("id"),
  ADD COLUMN IF NOT EXISTS "vendedor_id"     integer REFERENCES "vendedores"("id"),
  ADD COLUMN IF NOT EXISTS "lista_precios_id" integer REFERENCES "listas_precios"("id");
