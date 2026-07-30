-- Alerta double-check del método de pago (POS + factura).
-- Toggle por empresa; nace ENCENDIDA (red de seguridad). Solo roles con el
-- permiso 'pagos:config-alerta' (owner/admin) pueden cambiarla desde Configuración.
ALTER TABLE teams
  ADD COLUMN IF NOT EXISTS alerta_metodo_pago_activa boolean NOT NULL DEFAULT true;
