-- 0186 · De qué caja o banco sale el pago de la nómina.
--
-- El pago de sueldos y de la TSS/DGII salía siempre de la cuenta del método de
-- pago (efectivo → caja, lo demás → bancos). Una empresa con varios bancos, o
-- con una cuenta aparte para la nómina, no podía decir cuál. Ahora hay:
--   · una cuenta por defecto para pagos en efectivo y otra para los bancarios
--     (transferencia o cheque), en la configuración contable;
--   · la cuenta elegida en cada pago, que gana sobre la de por defecto.
-- Sin nada elegido, todo sigue saliendo como antes.
--
-- Aditiva e idempotente: se puede correr dos veces.

ALTER TABLE contabilidad_config
  ADD COLUMN IF NOT EXISTS cuenta_nomina_pago_efectivo_id INTEGER REFERENCES contabilidad_cuentas(id),
  ADD COLUMN IF NOT EXISTS cuenta_nomina_pago_banco_id    INTEGER REFERENCES contabilidad_cuentas(id);

ALTER TABLE nomina_pagos
  ADD COLUMN IF NOT EXISTS cuenta_salida_id INTEGER REFERENCES contabilidad_cuentas(id);

ALTER TABLE nomina_obligaciones
  ADD COLUMN IF NOT EXISTS cuenta_salida_id INTEGER REFERENCES contabilidad_cuentas(id);
