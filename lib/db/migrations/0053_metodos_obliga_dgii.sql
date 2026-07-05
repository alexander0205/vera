-- Config por empresa: métodos de pago que OBLIGAN emisión a la DGII.
-- Si una factura registra un pago con alguno de estos métodos, no se puede
-- guardar como borrador — debe emitirse a la DGII. Array JSON de valores de
-- METODO_PAGO_VALUES (lib/pagos/metodos.ts), ej: ["tarjeta"].
-- Vacío = sin restricción (comportamiento actual). Default vacío para no
-- alterar el flujo de las empresas existentes.

ALTER TABLE "teams"
  ADD COLUMN IF NOT EXISTS "metodos_obliga_dgii" jsonb NOT NULL DEFAULT '[]'::jsonb;
