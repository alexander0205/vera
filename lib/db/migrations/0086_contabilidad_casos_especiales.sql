-- Notas, anulaciones, mora, retenciones y saldos a favor. Paso 5 del plan.
--
-- El Paso 4 dejó tres casos saltados a propósito, cada uno con su motivo visible
-- en pantalla: documentos con retenciones, notas de crédito, y pagos con saldo a
-- favor. Este paso los cubre, y para eso hacen falta dos cuentas que el catálogo
-- base no tenía.
--
-- No se crean tablas nuevas: los asientos de estos casos van a las mismas
-- `contabilidad_asientos` / `contabilidad_asiento_lineas`. Solo cambia lo que se
-- sabe registrar.

-- ─── Dos destinos más en la configuración ────────────────────────────────────

-- Saldo a favor del cliente. Cuando una nota de crédito supera lo que el cliente
-- debía, el sobrante NO reduce la cuenta por cobrar: pasa a ser dinero que la
-- empresa le debe a él. Es un PASIVO, y tratarlo como menor cuenta por cobrar
-- dejaría la cartera en negativo y el balance mal.
ALTER TABLE contabilidad_config
  ADD COLUMN IF NOT EXISTS cuenta_saldos_favor_id integer REFERENCES contabilidad_cuentas(id);

-- Retenciones que le practica el cliente. Cuando un comprador retiene ITBIS o
-- ISR, esa plata no entra al banco: la paga él a la DGII por cuenta de la
-- empresa, y a la empresa le queda un crédito fiscal. Es un ACTIVO, no un menor
-- ingreso — la venta fue por el total.
ALTER TABLE contabilidad_config
  ADD COLUMN IF NOT EXISTS cuenta_retenciones_id integer REFERENCES contabilidad_cuentas(id);

-- ─── Nota sobre los asientos de anulación ────────────────────────────────────
--
-- No hacen falta cambios de esquema: `origen_tipo` ya admitía 'anulacion' desde
-- la migración 0085, precisamente para no tener que tocar el CHECK ahora. Un
-- documento anulado genera un segundo asiento con debe y haber intercambiados,
-- y el índice único (team_id, origen_tipo, origen_id) impide reversarlo dos
-- veces. El asiento original NO se borra: el historial contable no se reescribe.
