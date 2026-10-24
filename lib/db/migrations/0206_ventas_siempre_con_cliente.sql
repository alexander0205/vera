-- Ninguna factura de venta sin cliente (ver lib/clientes/cliente-de-factura.ts).
--
-- El 23-10-2026 había 1,049 facturas de venta sin cliente: no salían en la
-- cartera de nadie. El código ya no las crea; esto lo garantiza en la base,
-- venga la factura de donde venga.
--
-- ORDEN (si se corre antes, rompe la emisión o la mora):
--   1. Desplegar el código que siempre pone cliente (PR #157).
--   2. Atar las que ya existen en TODOS los colegios (atar-clientes.sql). Las
--      notas de mora toman el cliente de su factura: con una factura vieja sin
--      cliente, su mora nacería sin cliente y la regla la rechazaría.
--   3. Correr esto.
--
-- Quedan fuera: compras y gastos (41/43/47) —el RNC es del suplidor—, las
-- notas 33/34, que pueden modificar un NCF emitido fuera de Zero, y lo anulado
-- o rechazado, que no se cobra.
ALTER TABLE ecf_documents
  ADD CONSTRAINT ecf_ventas_con_cliente
  CHECK (client_id IS NOT NULL OR tipo_ecf IN ('33', '34', '41', '43', '47') OR estado IN ('ANULADO', 'RECHAZADO'));
