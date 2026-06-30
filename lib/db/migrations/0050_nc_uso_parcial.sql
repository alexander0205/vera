-- NC de uso PARCIAL: una nota de crédito puede aplicarse a varias facturas hasta
-- agotar su crédito. Quitar el índice único que la limitaba a un solo pago.
-- El saldo restante = credito_generado_cents − SUM(pagos con ese nota_credito_id).
DROP INDEX IF EXISTS pagos_recibidos_nota_credito_unico_idx;
