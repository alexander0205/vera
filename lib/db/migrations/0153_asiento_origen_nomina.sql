-- Nómina · Fase 3 — el asiento de una corrida usa origen_tipo 'nomina'. Se
-- añade al CHECK, mismo patrón que 0150 (gasto_doc). Los valores anteriores no
-- cambian; IF EXISTS porque se corre a mano.
ALTER TABLE contabilidad_asientos
  DROP CONSTRAINT IF EXISTS contabilidad_asientos_origen_chk;
ALTER TABLE contabilidad_asientos
  ADD CONSTRAINT contabilidad_asientos_origen_chk
    CHECK (origen_tipo IN ('factura', 'pago', 'nota', 'anulacion', 'manual', 'compra', 'gasto_caja', 'depreciacion', 'gasto_doc', 'nomina'));
