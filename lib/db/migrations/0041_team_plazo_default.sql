-- Plazo de pago por defecto a nivel de team.
-- NULL = de contado (sin vencimiento); N = crédito a N días.
ALTER TABLE teams ADD COLUMN IF NOT EXISTS plazo_pago_default_dias integer;
