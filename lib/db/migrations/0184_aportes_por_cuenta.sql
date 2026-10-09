-- 0184 · Cada aporte patronal y cada retención del empleado a su cuenta.
--
-- El asiento de nómina mandaba los cuatro aportes patronales (SFS, AFP, riesgos
-- laborales e INFOTEP) a una sola cuenta de gasto, y las dos retenciones del
-- empleado (SFS y AFP) a una sola de pasivo. El catálogo de un contador los
-- tiene separados, y así el mayor no cuadra línea por línea contra la factura
-- de la TSS: hay que abrir el detalle de la nómina para repartirlo a mano.
--
-- Quien no configure nada sigue igual: estas cuentas vacías caen en las de
-- siempre (`cuenta_nomina_aportes_gasto_id` y `cuenta_nomina_retenciones_id`).
--
-- Aditiva e idempotente: se puede correr dos veces.

ALTER TABLE contabilidad_config
  -- Gasto patronal, uno por concepto de la TSS.
  ADD COLUMN IF NOT EXISTS cuenta_aporte_sfs_gasto_id     INTEGER REFERENCES contabilidad_cuentas(id),
  ADD COLUMN IF NOT EXISTS cuenta_aporte_afp_gasto_id     INTEGER REFERENCES contabilidad_cuentas(id),
  ADD COLUMN IF NOT EXISTS cuenta_aporte_srl_gasto_id     INTEGER REFERENCES contabilidad_cuentas(id),
  ADD COLUMN IF NOT EXISTS cuenta_aporte_infotep_gasto_id INTEGER REFERENCES contabilidad_cuentas(id),
  -- Pasivo de lo retenido al empleado, separado por concepto.
  ADD COLUMN IF NOT EXISTS cuenta_ret_sfs_pagar_id        INTEGER REFERENCES contabilidad_cuentas(id),
  ADD COLUMN IF NOT EXISTS cuenta_ret_afp_pagar_id        INTEGER REFERENCES contabilidad_cuentas(id);
