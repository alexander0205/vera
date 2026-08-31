-- Provisiones de nómina en contabilidad: toggle + 2 cuentas. Aditiva.
-- Apagado por defecto: quien no quiera provisionar en el libro no ve cambios.

ALTER TABLE contabilidad_config
  ADD COLUMN IF NOT EXISTS provisionar_nomina            boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS cuenta_provision_gasto_id     integer REFERENCES contabilidad_cuentas(id),
  ADD COLUMN IF NOT EXISTS cuenta_provision_por_pagar_id integer REFERENCES contabilidad_cuentas(id);

-- El asiento de provisión de nómina es un origen contable nuevo.
ALTER TABLE contabilidad_asientos
  DROP CONSTRAINT IF EXISTS contabilidad_asientos_origen_chk;
ALTER TABLE contabilidad_asientos
  ADD CONSTRAINT contabilidad_asientos_origen_chk
  CHECK (origen_tipo IN ('factura','pago','nota','anulacion','manual','compra','gasto_caja','depreciacion','gasto_doc','nomina','pago_nomina','provision_nomina'));
