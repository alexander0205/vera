-- Módulo Maestros — listas custom de atributos por equipo.
-- Un "maestro" es una lista (ej. Marca, Color) con valores manuales (Toyota,
-- Lexus, …). Se engancha a productos/servicios como labels.
--
-- aplica_a define a qué productos aplica automáticamente:
--   'bien'     → todos los bienes
--   'servicio' → todos los servicios
--   'ambos'    → todos
--   'manual'   → solo los productos donde se agregue explícitamente
-- (En el futuro se podrá extender a 'categoria' sin romper este esquema.)
--
-- multiple: false = un valor por producto (color); true = varios (etiquetas).

-- ── Tabla maestros ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "maestros" (
  "id"          serial PRIMARY KEY NOT NULL,
  "team_id"     integer NOT NULL REFERENCES "teams"("id"),
  "nombre"      varchar(100) NOT NULL,
  "descripcion" text,
  "aplica_a"    varchar(10) NOT NULL DEFAULT 'manual',
  "multiple"    boolean NOT NULL DEFAULT false,
  "created_at"  timestamp DEFAULT now() NOT NULL,
  "updated_at"  timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "maestros_team_idx"
  ON "maestros" ("team_id");

-- ── Tabla maestro_valores (opciones del dropdown) ────────────────────────────

CREATE TABLE IF NOT EXISTS "maestro_valores" (
  "id"         serial PRIMARY KEY NOT NULL,
  "maestro_id" integer NOT NULL REFERENCES "maestros"("id") ON DELETE CASCADE,
  "valor"      varchar(150) NOT NULL,
  "orden"      integer NOT NULL DEFAULT 0,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "maestro_valores_maestro_idx"
  ON "maestro_valores" ("maestro_id");

-- ── Tabla producto_maestro_valores (asignaciones a productos) ────────────────
-- multi = varias filas por (product_id, maestro_id).
-- single = la app garantiza 1 fila por (product_id, maestro_id).
-- También sirve de opt-in para maestros 'manual'.

CREATE TABLE IF NOT EXISTS "producto_maestro_valores" (
  "id"         serial PRIMARY KEY NOT NULL,
  "product_id" integer NOT NULL REFERENCES "products"("id") ON DELETE CASCADE,
  "maestro_id" integer NOT NULL REFERENCES "maestros"("id") ON DELETE CASCADE,
  "valor_id"   integer NOT NULL REFERENCES "maestro_valores"("id") ON DELETE CASCADE,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "producto_maestro_valores_product_idx"
  ON "producto_maestro_valores" ("product_id");
CREATE INDEX IF NOT EXISTS "producto_maestro_valores_maestro_idx"
  ON "producto_maestro_valores" ("maestro_id");

-- Evita duplicar el mismo valor en el mismo producto.
CREATE UNIQUE INDEX IF NOT EXISTS "producto_maestro_valores_uniq"
  ON "producto_maestro_valores" ("product_id", "valor_id");
