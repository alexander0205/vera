-- Plan A — Maestros aplicables a múltiples formularios (no solo productos).
-- Un maestro ahora puede aplicar a 'producto' y/o 'factura' (extensible).
-- aplicaA (bien|servicio|ambos|manual) queda como sub-regla SOLO del lado
-- producto; para factura el maestro aplica a la cabecera de todas las facturas.

-- ── Tabla maestro_targets (a qué entidades aplica cada maestro) ───────────────
CREATE TABLE IF NOT EXISTS "maestro_targets" (
  "id"         serial PRIMARY KEY NOT NULL,
  "maestro_id" integer NOT NULL REFERENCES "maestros"("id") ON DELETE CASCADE,
  "entidad"    varchar(20) NOT NULL,   -- 'producto' | 'factura'
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "maestro_targets_uniq"
  ON "maestro_targets" ("maestro_id", "entidad");

-- Backfill: todo maestro existente aplicaba a productos.
INSERT INTO "maestro_targets" ("maestro_id", "entidad")
SELECT "id", 'producto' FROM "maestros"
ON CONFLICT ("maestro_id", "entidad") DO NOTHING;

-- ── Tabla factura_maestro_valores (clasificación de la factura) ───────────────
CREATE TABLE IF NOT EXISTS "factura_maestro_valores" (
  "id"               serial PRIMARY KEY NOT NULL,
  "ecf_document_id"  integer NOT NULL REFERENCES "ecf_documents"("id") ON DELETE CASCADE,
  "maestro_id"       integer NOT NULL REFERENCES "maestros"("id") ON DELETE CASCADE,
  "valor_id"         integer NOT NULL REFERENCES "maestro_valores"("id") ON DELETE CASCADE,
  "created_at"       timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "factura_maestro_valores_doc_idx"
  ON "factura_maestro_valores" ("ecf_document_id");
CREATE INDEX IF NOT EXISTS "factura_maestro_valores_maestro_idx"
  ON "factura_maestro_valores" ("maestro_id");
-- Para filtrar facturas por valor de maestro.
CREATE INDEX IF NOT EXISTS "factura_maestro_valores_valor_idx"
  ON "factura_maestro_valores" ("valor_id");

CREATE UNIQUE INDEX IF NOT EXISTS "factura_maestro_valores_uniq"
  ON "factura_maestro_valores" ("ecf_document_id", "valor_id");
