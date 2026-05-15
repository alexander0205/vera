-- Migration 0026: agrega descripcion + dia_cobro a facturas_recurrentes
-- descripcion: texto corto opcional visible en UI/PDF (distinto de notas internas)
-- dia_cobro:  día del mes (1-31) para frecuencias mensual/trimestral/anual;
--             null para semanal/quincenal. Cron lo usa para evitar drift al sumar meses.

ALTER TABLE facturas_recurrentes
  ADD COLUMN IF NOT EXISTS descripcion varchar(200);

ALTER TABLE facturas_recurrentes
  ADD COLUMN IF NOT EXISTS dia_cobro integer;

-- Backfill dia_cobro desde el día de fecha_inicio para planes existentes
-- con frecuencia mensual/trimestral/anual (mantiene cobros consistentes).
UPDATE facturas_recurrentes
SET dia_cobro = EXTRACT(DAY FROM fecha_inicio)::integer
WHERE dia_cobro IS NULL
  AND frecuencia IN ('mensual', 'trimestral', 'anual');
