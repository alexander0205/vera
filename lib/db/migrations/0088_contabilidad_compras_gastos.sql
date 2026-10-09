-- Nivel 3.2 — Asientos de compras (entradas de inventario) y gastos de caja.
--
-- No hay tablas nuevas ni se toca ninguna tabla de origen (compras_locales,
-- caja_movimientos): contabilidad las LEE. Solo dos cosas, ambas en tablas del
-- propio motor contable.

-- 1. Ampliar el CHECK de origen para admitir 'compra' y 'gasto_caja'. Los cinco
--    valores anteriores siguen igual.
ALTER TABLE contabilidad_asientos
  DROP CONSTRAINT contabilidad_asientos_origen_chk;
ALTER TABLE contabilidad_asientos
  ADD CONSTRAINT contabilidad_asientos_origen_chk
    CHECK (origen_tipo IN ('factura', 'pago', 'nota', 'anulacion', 'manual', 'compra', 'gasto_caja'));

-- 2. Cuentas destino de compras y gastos en la config del team. Nullables: el
--    generador cae al código base estándar (1105 / 2101 / 6101) si están en
--    NULL, así que funciona sin configurar y se puede personalizar.
ALTER TABLE contabilidad_config
  ADD COLUMN IF NOT EXISTS cuenta_inventario_id  integer REFERENCES contabilidad_cuentas(id),
  ADD COLUMN IF NOT EXISTS cuenta_por_pagar_id   integer REFERENCES contabilidad_cuentas(id),
  ADD COLUMN IF NOT EXISTS cuenta_gastos_id      integer REFERENCES contabilidad_cuentas(id);

-- Backfill de los teams que ya tienen config: apuntar a las cuentas base
-- estándar si existen. No sobrescribe lo que el usuario ya hubiera fijado.
UPDATE contabilidad_config c SET
  cuenta_inventario_id = COALESCE(c.cuenta_inventario_id,
    (SELECT id FROM contabilidad_cuentas WHERE team_id = c.team_id AND codigo = '1105' AND imputable AND activa)),
  cuenta_por_pagar_id = COALESCE(c.cuenta_por_pagar_id,
    (SELECT id FROM contabilidad_cuentas WHERE team_id = c.team_id AND codigo = '2101' AND imputable AND activa)),
  cuenta_gastos_id = COALESCE(c.cuenta_gastos_id,
    (SELECT id FROM contabilidad_cuentas WHERE team_id = c.team_id AND codigo = '6101' AND imputable AND activa));
