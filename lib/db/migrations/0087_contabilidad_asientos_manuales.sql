-- Asientos manuales. Paso posterior al 6: lo que no nace de un documento
-- (nómina, alquiler, depreciación, ajustes del contador) se registra a mano.
--
-- No hay tabla nueva: los asientos manuales van a las mismas dos tablas del
-- Paso 4. Solo hacen falta dos cosas.

-- 1. Ampliar el CHECK de origen para admitir 'manual'. Los otros cuatro valores
--    siguen igual; solo se suma uno.
ALTER TABLE contabilidad_asientos
  DROP CONSTRAINT contabilidad_asientos_origen_chk;
ALTER TABLE contabilidad_asientos
  ADD CONSTRAINT contabilidad_asientos_origen_chk
    CHECK (origen_tipo IN ('factura', 'pago', 'nota', 'anulacion', 'manual'));

-- 2. Una secuencia para el origen_id sintético de los asientos manuales.
--    El índice único (team_id, origen_tipo, origen_id) exige un origen_id, pero
--    un asiento manual no tiene documento del cual sacarlo. Un valor de esta
--    secuencia es único de por vida, así que cada asiento manual es distinto y
--    el índice nunca choca — que es justo lo contrario de la idempotencia de los
--    automáticos: dos asientos manuales iguales SÍ son dos asientos.
CREATE SEQUENCE IF NOT EXISTS contabilidad_asiento_manual_seq;
