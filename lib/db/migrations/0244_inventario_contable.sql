-- 0244 · Inventario contable: costo de ventas, ajustes de stock y compra de activos en el libro.
--
-- 1) inventory_movements guarda, al momento de cada salida/entrada, el costo promedio
--    con que se valoró (foto): así un cambio de costo posterior no reescribe la historia
--    y la devolución usa el mismo costo con que salió la venta.
--      costo_unitario_cents  costo promedio por unidad (centavos). NULL = no se valoró
--                            (movimientos anteriores a esta migración, compras que ya
--                            asientan su propio inventario, productos sin costo).
--      costo_total_cents     cantidad × costo, redondeado una vez (centavos).
--      asiento_id            el asiento que lo contabilizó. NULL + costo = pendiente de asentar.
-- 1b) ecf_documents.devuelve_mercancia: en una nota de crédito, «el cliente devolvió la mercancía».
-- 2) Nuevos orígenes de asiento en contabilidad_asientos_origen_chk:
--      costo_venta         Dr 5101 / Cr 1105 por ventas (y el reverso por devoluciones)
--      ajuste_inventario   mermas, sobrantes y stock inicial
--      activo_compra       adquisición de un activo fijo (lo usa el módulo de activos)
--
-- Aditiva e idempotente. La restricción se redefine LEYENDO la vigente y agregando solo
-- lo que falte, para no pisar lo que otra migración haya agregado (mismo método que 0235).

ALTER TABLE inventory_movements ADD COLUMN IF NOT EXISTS costo_unitario_cents integer;
ALTER TABLE inventory_movements ADD COLUMN IF NOT EXISTS costo_total_cents bigint;
ALTER TABLE inventory_movements ADD COLUMN IF NOT EXISTS asiento_id integer
  REFERENCES contabilidad_asientos(id) ON DELETE SET NULL;

ALTER TABLE ecf_documents ADD COLUMN IF NOT EXISTS devuelve_mercancia boolean NOT NULL DEFAULT false;

-- Lo que el barrido busca: movimientos valorados que aún no tienen asiento.
CREATE INDEX IF NOT EXISTS inv_mov_pendiente_asiento_idx
  ON inventory_movements (team_id, id)
  WHERE asiento_id IS NULL AND costo_total_cents IS NOT NULL;

DO $$
DECLARE
  def text;
  nuevo text;
  agregados text := '';
BEGIN
  SELECT pg_get_constraintdef(c.oid) INTO def
  FROM pg_constraint c
  WHERE c.conname = 'contabilidad_asientos_origen_chk'
    AND c.conrelid = 'contabilidad_asientos'::regclass;

  IF def IS NULL THEN
    RETURN;
  END IF;

  FOREACH nuevo IN ARRAY ARRAY['costo_venta', 'ajuste_inventario', 'activo_compra'] LOOP
    IF def NOT LIKE '%''' || nuevo || '''%' THEN
      agregados := agregados || '''' || nuevo || '''::character varying, ';
    END IF;
  END LOOP;

  IF agregados = '' THEN
    RETURN;
  END IF;

  EXECUTE 'ALTER TABLE contabilidad_asientos DROP CONSTRAINT contabilidad_asientos_origen_chk';
  EXECUTE 'ALTER TABLE contabilidad_asientos ADD CONSTRAINT contabilidad_asientos_origen_chk '
    || replace(def, 'ARRAY[', 'ARRAY[' || agregados);
END $$;
