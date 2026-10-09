-- Nómina: cuentas contables dedicadas para el asiento de la corrida.
-- Aditiva. Cada una es opcional: sin configurar, el asiento cae a la cuenta de
-- gastos (6101) y la de por pagar (2101) genéricas, como hasta ahora.

ALTER TABLE contabilidad_config
  ADD COLUMN IF NOT EXISTS cuenta_nomina_sueldo_id        integer REFERENCES contabilidad_cuentas(id),
  ADD COLUMN IF NOT EXISTS cuenta_nomina_aportes_gasto_id integer REFERENCES contabilidad_cuentas(id),
  ADD COLUMN IF NOT EXISTS cuenta_nomina_retenciones_id   integer REFERENCES contabilidad_cuentas(id),
  ADD COLUMN IF NOT EXISTS cuenta_nomina_aportes_pagar_id integer REFERENCES contabilidad_cuentas(id),
  ADD COLUMN IF NOT EXISTS cuenta_nomina_por_pagar_id     integer REFERENCES contabilidad_cuentas(id);
