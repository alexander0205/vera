-- 0188 · Pago mixto en compras y gastos de contado.
--
-- Una compra se pagaba con UN método desde UNA cuenta. Una factura pagada parte
-- en efectivo y parte por transferencia no tenía dónde guardarse: el asiento
-- sacaba todo de una sola caja y el libro banco no cuadraba con el estado de
-- cuenta. Ahora el reparto se guarda aquí: [{ metodo, cuentaSalidaId, montoCents }].
-- NULL = pago de un solo método, como siempre.
--
-- Aditiva e idempotente: se puede correr dos veces.

ALTER TABLE compras_locales
  ADD COLUMN IF NOT EXISTS pagos_mixtos JSONB;
