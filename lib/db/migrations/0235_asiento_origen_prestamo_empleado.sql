-- 0235 · Un origen nuevo de asiento: el desembolso de un préstamo o avance a un empleado.
--
-- Cuando se registra un préstamo y se dice de dónde salió el dinero, nace un asiento
-- (Dr cuentas por cobrar a empleados / Cr caja o banco) con origen `prestamo_empleado`
-- y el id del préstamo, así que no se puede duplicar.
--
-- La restricción de orígenes ya la redefinieron varias migraciones y otras la seguirán
-- tocando: en lugar de reescribir la lista entera (y pisar lo que otra haya agregado),
-- se LEE la definición vigente y solo se le añade el origen nuevo.
--
-- Aditiva e idempotente: si ya está, no hace nada.

DO $$
DECLARE
  def text;
BEGIN
  SELECT pg_get_constraintdef(c.oid) INTO def
  FROM pg_constraint c
  WHERE c.conname = 'contabilidad_asientos_origen_chk'
    AND c.conrelid = 'contabilidad_asientos'::regclass;

  IF def IS NULL OR def LIKE '%prestamo_empleado%' THEN
    RETURN;
  END IF;

  EXECUTE 'ALTER TABLE contabilidad_asientos DROP CONSTRAINT contabilidad_asientos_origen_chk';
  EXECUTE 'ALTER TABLE contabilidad_asientos ADD CONSTRAINT contabilidad_asientos_origen_chk '
    || replace(def, 'ARRAY[', 'ARRAY[''prestamo_empleado''::character varying, ');
END $$;
