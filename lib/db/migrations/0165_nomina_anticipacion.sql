-- Nómina · Anticipación de la corrida automática.
--
-- La corrida ya no nace EL día de pago sino unos días ANTES, para que quien
-- administra tenga tiempo de revisarla y aprobarla antes de que llegue la fecha.
-- `anticipacion_dias` es ese margen por empresa (default 5). El cron crea la
-- corrida cuando hoy = (día de pago − anticipación), y le pone como fecha de
-- pago la fecha real (no la de hoy).
--
-- Aditiva: columna nueva con default. Las empresas ya configuradas heredan 5.
ALTER TABLE nomina_programacion
  ADD COLUMN IF NOT EXISTS anticipacion_dias INTEGER NOT NULL DEFAULT 5;
