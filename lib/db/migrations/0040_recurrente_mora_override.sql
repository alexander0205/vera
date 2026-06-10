-- Términos de mora a nivel de factura recurrente (override por plan).
-- Fallback: factura → recurrente → config global del team.
-- bps (200 = 2%) y días, ambos nullable.
ALTER TABLE facturas_recurrentes ADD COLUMN IF NOT EXISTS mora_porcentaje integer;
ALTER TABLE facturas_recurrentes ADD COLUMN IF NOT EXISTS mora_dias_gracia integer;
