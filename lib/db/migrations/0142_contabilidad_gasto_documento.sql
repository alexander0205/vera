-- Asiento del GASTO documental (e43/e47) cuando el negocio NO usa caja. Con
-- caja, el gasto ya se asienta vía su movimiento (origen 'gasto_caja'); sin
-- caja no dejaba rastro contable. Se añade 'gasto_doc' al CHECK de origen.
-- Mismo patrón que 0088/0089; los valores anteriores no cambian.
ALTER TABLE contabilidad_asientos
  DROP CONSTRAINT contabilidad_asientos_origen_chk;
ALTER TABLE contabilidad_asientos
  ADD CONSTRAINT contabilidad_asientos_origen_chk
    CHECK (origen_tipo IN ('factura', 'pago', 'nota', 'anulacion', 'manual', 'compra', 'gasto_caja', 'depreciacion', 'gasto_doc'));
