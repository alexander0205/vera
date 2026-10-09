-- Nómina → contabilidad: que todo lo que pasa en la nómina quede en el libro.
--
-- 1) El CHECK de origen de los asientos. La 0150 lo rehízo sin 'pago_proveedor'
--    ni 'cierre' (que habían entrado en la 0091 y la 0092), y las de nómina
--    siguieron copiando esa lista: desde entonces un pago a proveedor o un cierre
--    de ejercicio no se pueden asentar. Se restauran y se agrega 'pago_sueldos'.
-- 2) Pagos a empleados: cada «marcar pagados» es un pago con fecha, método y monto,
--    y lleva su asiento (DEBE sueldos por pagar · HABER caja o banco). Antes solo
--    se marcaba la línea y el pasivo de sueldos quedaba abierto para siempre.
-- 3) Método con que se pagó cada obligación, para poder asentarla después si la
--    contabilidad estaba apagada cuando se pagó.
-- 4) Cuentas separadas: ISR de asalariados (DGII) e INFOTEP aparte de la TSS, y
--    una cuenta de gasto y otra de pasivo por cada provisión.
--
-- Aditiva e idempotente: se corre a mano con psql.

ALTER TABLE contabilidad_asientos DROP CONSTRAINT IF EXISTS contabilidad_asientos_origen_chk;
ALTER TABLE contabilidad_asientos
  ADD CONSTRAINT contabilidad_asientos_origen_chk
    CHECK (origen_tipo IN ('factura', 'pago', 'nota', 'anulacion', 'manual', 'compra', 'gasto_caja',
                           'gasto_doc', 'depreciacion', 'pago_proveedor', 'cierre',
                           'nomina', 'pago_nomina', 'provision_nomina', 'pago_sueldos'));

CREATE TABLE IF NOT EXISTS nomina_pagos (
  id          SERIAL PRIMARY KEY,
  team_id     INTEGER NOT NULL REFERENCES teams(id),
  corrida_id  INTEGER NOT NULL REFERENCES nomina_corridas(id) ON DELETE CASCADE,
  fecha       DATE NOT NULL,
  metodo      VARCHAR(20) NOT NULL,
  monto_cents BIGINT NOT NULL,
  lineas      INTEGER NOT NULL DEFAULT 0,
  asiento_id  INTEGER REFERENCES contabilidad_asientos(id),
  created_by  INTEGER REFERENCES users(id),
  created_at  TIMESTAMP NOT NULL DEFAULT now(),
  CONSTRAINT nomina_pagos_metodo_chk CHECK (metodo IN ('efectivo', 'transferencia', 'cheque')),
  CONSTRAINT nomina_pagos_monto_chk  CHECK (monto_cents > 0)
);
CREATE INDEX IF NOT EXISTS nomina_pagos_corrida_idx ON nomina_pagos (team_id, corrida_id);

ALTER TABLE nomina_lineas       ADD COLUMN IF NOT EXISTS pago_id     INTEGER REFERENCES nomina_pagos(id);
ALTER TABLE nomina_obligaciones ADD COLUMN IF NOT EXISTS metodo_pago VARCHAR(20);

ALTER TABLE contabilidad_config
  ADD COLUMN IF NOT EXISTS cuenta_nomina_isr_pagar_id        INTEGER REFERENCES contabilidad_cuentas(id),
  ADD COLUMN IF NOT EXISTS cuenta_nomina_infotep_pagar_id    INTEGER REFERENCES contabilidad_cuentas(id),
  ADD COLUMN IF NOT EXISTS cuenta_prov_regalia_gasto_id      INTEGER REFERENCES contabilidad_cuentas(id),
  ADD COLUMN IF NOT EXISTS cuenta_prov_regalia_pagar_id      INTEGER REFERENCES contabilidad_cuentas(id),
  ADD COLUMN IF NOT EXISTS cuenta_prov_vacaciones_gasto_id   INTEGER REFERENCES contabilidad_cuentas(id),
  ADD COLUMN IF NOT EXISTS cuenta_prov_vacaciones_pagar_id   INTEGER REFERENCES contabilidad_cuentas(id),
  ADD COLUMN IF NOT EXISTS cuenta_prov_cesantia_gasto_id     INTEGER REFERENCES contabilidad_cuentas(id),
  ADD COLUMN IF NOT EXISTS cuenta_prov_cesantia_pagar_id     INTEGER REFERENCES contabilidad_cuentas(id);
