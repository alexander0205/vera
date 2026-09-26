-- 0183 · De qué cuenta sale el dinero de un gasto.
--
-- Hasta ahora la cuenta del haber salía SOLO del método de pago configurado:
-- una empresa con dos bancos tenía todas sus transferencias en el mismo, y el
-- mayor no cuadraba con el estado de cuenta. El gasto quedaba bien; el dinero
-- salía de la cuenta equivocada. Ahora quien registra elige la cuenta, y si no
-- elige, sigue saliendo la del método como antes.
--
-- Aditiva e idempotente: se puede correr dos veces.

-- La cuenta elegida al registrar el comprobante de contado.
-- NULL = la del método de pago (lib/contabilidad/cuenta-salida).
ALTER TABLE compras_locales
  ADD COLUMN IF NOT EXISTS cuenta_salida_id INTEGER REFERENCES contabilidad_cuentas(id);

-- Lo mismo al pagar después una compra a crédito.
ALTER TABLE pagos_proveedores
  ADD COLUMN IF NOT EXISTS cuenta_salida_id INTEGER REFERENCES contabilidad_cuentas(id);
