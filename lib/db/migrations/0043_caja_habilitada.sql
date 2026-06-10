-- Módulo Cuadre de Caja — Paso 1a.
-- Toggle por empresa que habilita el módulo de caja.
-- Si caja_habilitada = true: aparece el grupo "Caja" en el sidebar, el badge
-- de estado en el header, y no se puede facturar sin un turno de caja abierto.

ALTER TABLE "teams"
  ADD COLUMN IF NOT EXISTS "caja_habilitada" boolean NOT NULL DEFAULT false;