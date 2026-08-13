-- Drift de schema: `listas_precios.solo_pos` se agregó a schema.ts pero nunca
-- se escribió su migración, así que las DBs sin la columna daban
-- `column "solo_pos" does not exist` (500 en GET /api/listas-precios), porque
-- Drizzle selecciona todas las columnas de la tabla.
--
-- Marca una lista de precios como de uso exclusivo del punto de venta (espejo
-- del mismo flag en almacenes, mig 0094). Aditiva: default false = conducta
-- actual (visible en todos lados).

ALTER TABLE listas_precios
  ADD COLUMN IF NOT EXISTS solo_pos boolean NOT NULL DEFAULT false;
