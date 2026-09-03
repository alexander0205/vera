-- El comprobante del padre podía pagar cargos, pero no mora.
--
-- `cargos` guarda lo que el padre creía estar pagando, y la aprobación reparte
-- el dinero contra las FACTURAS de esos cargos. La mora no es un cargo: es una
-- nota de débito colgada de la factura vencida, sin fila en
-- admin_escolar_cargos. Por eso el dinero nunca podía llegarle, aunque el padre
-- transfiriera de más a propósito.
--
-- Se guarda aparte y no dentro de `cargos` porque no son la misma cosa: un
-- cargo apunta a una factura, y una mora YA es la factura.
ALTER TABLE admin_escolar_comprobantes
  ADD COLUMN IF NOT EXISTS moras jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN admin_escolar_comprobantes.moras IS
  'Notas de débito por mora que el padre estaba pagando, tal como estaban al subir el comprobante.';
