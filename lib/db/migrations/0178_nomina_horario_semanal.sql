-- Nómina · horario semanal del empleado.
--
-- La jornada era un texto («Domingo» en días de descanso) sin horas. Ahora cada
-- empleado tiene sus horas por día de la semana: con eso se valida la jornada
-- legal (8 horas al día y 44 a la semana, art. 147), el descanso semanal
-- (art. 163) y el valor de la hora para las horas extra.
--
-- Aditiva e idempotente: se corre a mano con psql.

ALTER TABLE empleados ADD COLUMN IF NOT EXISTS horario_semanal JSONB;
