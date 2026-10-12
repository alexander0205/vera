-- Nómina · corridas por fechas.
--
-- Una corrida paga un rango (`fecha_inicio` a `fecha_fin`, inclusivo); `periodo`
-- queda como su mes contable. La protección contra duplicados pasa de
-- (team, periodo, tipo) a (team, tipo, fecha_inicio): la vieja impedía correr
-- más de una nómina semanal al mes.
--
-- Las líneas guardan los días que se pagaron del período, para quien entró o
-- salió dentro de él.
--
-- Idempotente: se corre a mano con psql.

ALTER TABLE nomina_corridas ADD COLUMN IF NOT EXISTS fecha_inicio DATE;
ALTER TABLE nomina_corridas ADD COLUMN IF NOT EXISTS fecha_fin    DATE;

-- «quincenal» a secas era la 1ra quincena del diálogo viejo. Se renombra salvo
-- que el mes ya tenga una «quincenal-1», que chocaría con el índice nuevo.
UPDATE nomina_corridas c
   SET tipo = 'quincenal-1'
 WHERE c.tipo = 'quincenal'
   AND NOT EXISTS (
     SELECT 1 FROM nomina_corridas o
      WHERE o.team_id = c.team_id AND o.periodo = c.periodo AND o.tipo = 'quincenal-1'
   );

-- Rango de las corridas existentes a partir de su mes y su tipo. Una semanal
-- vieja era «la semana 1 de 4» del mes: se le da la primera semana.
UPDATE nomina_corridas
   SET fecha_inicio = CASE WHEN tipo = 'quincenal-2' THEN (periodo || '-16')::date
                           ELSE (periodo || '-01')::date END,
       fecha_fin    = CASE WHEN tipo IN ('quincenal', 'quincenal-1') THEN (periodo || '-15')::date
                           WHEN tipo = 'semanal' THEN (periodo || '-07')::date
                           ELSE ((periodo || '-01')::date + INTERVAL '1 month' - INTERVAL '1 day')::date END
 WHERE fecha_inicio IS NULL OR fecha_fin IS NULL;

ALTER TABLE nomina_corridas ALTER COLUMN fecha_inicio SET NOT NULL;
ALTER TABLE nomina_corridas ALTER COLUMN fecha_fin    SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'nomina_corridas_rango_chk') THEN
    ALTER TABLE nomina_corridas ADD CONSTRAINT nomina_corridas_rango_chk CHECK (fecha_fin >= fecha_inicio);
  END IF;
END $$;

DROP INDEX IF EXISTS nomina_corridas_periodo_uniq;
CREATE UNIQUE INDEX IF NOT EXISTS nomina_corridas_inicio_uniq ON nomina_corridas (team_id, tipo, fecha_inicio);
CREATE INDEX IF NOT EXISTS nomina_corridas_team_rango_idx ON nomina_corridas (team_id, fecha_inicio, fecha_fin);

ALTER TABLE nomina_lineas ADD COLUMN IF NOT EXISTS dias_pagados INTEGER;
ALTER TABLE nomina_lineas ADD COLUMN IF NOT EXISTS dias_periodo INTEGER;
