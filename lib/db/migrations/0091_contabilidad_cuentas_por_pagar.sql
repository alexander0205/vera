-- Nivel 4.1 — Cuentas por pagar: términos de compra y pagos a proveedores.
ALTER TABLE compras_locales
  ADD COLUMN IF NOT EXISTS forma_pago varchar(10) NOT NULL DEFAULT 'credito',
  ADD COLUMN IF NOT EXISTS metodo_pago varchar(30) NOT NULL DEFAULT 'efectivo',
  ADD COLUMN IF NOT EXISTS fecha_vencimiento date,
  ADD COLUMN IF NOT EXISTS estado_pago varchar(12) NOT NULL DEFAULT 'PENDIENTE',
  ADD CONSTRAINT compras_locales_forma_pago_chk CHECK (forma_pago IN ('contado', 'credito')),
  ADD CONSTRAINT compras_locales_estado_pago_chk CHECK (estado_pago IN ('PENDIENTE', 'PARCIAL', 'PAGADA'));

CREATE TABLE IF NOT EXISTS pagos_proveedores (
  id serial PRIMARY KEY,
  team_id integer NOT NULL REFERENCES teams(id),
  compra_id integer NOT NULL REFERENCES compras_locales(id),
  monto_cents integer NOT NULL CHECK (monto_cents > 0),
  metodo varchar(30) NOT NULL,
  fecha_pago date NOT NULL,
  referencia varchar(100),
  notas text,
  created_by integer REFERENCES users(id),
  created_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS pagos_proveedores_team_compra_idx ON pagos_proveedores(team_id, compra_id);

ALTER TABLE contabilidad_asientos DROP CONSTRAINT contabilidad_asientos_origen_chk;
ALTER TABLE contabilidad_asientos ADD CONSTRAINT contabilidad_asientos_origen_chk
  CHECK (origen_tipo IN ('factura','pago','nota','anulacion','manual','compra','gasto_caja','depreciacion','pago_proveedor'));
