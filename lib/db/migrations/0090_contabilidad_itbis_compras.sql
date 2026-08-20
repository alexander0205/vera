-- Nivel 4.3 — ITBIS de compras por régimen contable.
--
-- La compra conserva el total realmente adeudado al proveedor en `monto_total`
-- (base + ITBIS). `itbis_cents` permite separar el crédito fiscal solo para
-- empresas gravadas; las exentas siguen llevando el total a Inventario.

ALTER TABLE compras_locales
  ADD COLUMN IF NOT EXISTS itbis_cents integer NOT NULL DEFAULT 0,
  ADD CONSTRAINT compras_locales_itbis_cents_chk CHECK (itbis_cents >= 0);

-- Cada empresa decide el tratamiento. El default preserva exactamente la
-- conducta previa de 3.2: ITBIS incluido en el costo de inventario.
ALTER TABLE contabilidad_config
  ADD COLUMN IF NOT EXISTS regimen_itbis varchar(10) NOT NULL DEFAULT 'exento',
  ADD CONSTRAINT contabilidad_config_regimen_itbis_chk
    CHECK (regimen_itbis IN ('exento', 'gravado'));
