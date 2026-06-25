-- Pago con Nota de Crédito específica (voucher por código): el pago referencia
-- la NC consumida. Una NC se usa UNA sola vez = existe un pago con su id aquí.
-- NULL para pagos normales (efectivo/transferencia/saldo_favor agregado).
ALTER TABLE pagos_recibidos ADD COLUMN IF NOT EXISTS nota_credito_id integer;

-- Unicidad: una NC no puede consumirse dos veces (un solo pago la referencia).
CREATE UNIQUE INDEX IF NOT EXISTS pagos_recibidos_nota_credito_unico_idx
  ON pagos_recibidos (nota_credito_id)
  WHERE nota_credito_id IS NOT NULL;
