-- Toggle por empresa para la alerta double-check del método de pago.
-- Si está activo (Y el rol tiene el permiso 'pagos:alerta-metodo'), al cobrar
-- una factura/POS se pide reconfirmar el método antes de finalizar. Nace apagado.
ALTER TABLE "teams" ADD COLUMN IF NOT EXISTS "alerta_metodo_pago_activo" boolean NOT NULL DEFAULT false;
