-- Facturación automática escolar: el calendario del concepto emite la factura.
--
-- Una sola columna hace de interruptor y de línea de corte. NULL = apagado.
-- Con fecha, el cron solo factura cuotas cuya EMISIÓN cae en o después de ese
-- día, así que encenderlo nunca factura hacia atrás: los cargos viejos sin
-- factura (997 en producción al escribir esto) siguen siendo trabajo manual.
--
-- Es `date` y no `boolean` a propósito: con un booleano, encender el día 2
-- habría facturado de golpe las cuotas emitidas el 30 del mes anterior.
ALTER TABLE teams
  ADD COLUMN IF NOT EXISTS escolar_facturacion_automatica_desde date;

COMMENT ON COLUMN teams.escolar_facturacion_automatica_desde IS
  'Desde qué fecha de emisión el cron factura solo las cuotas escolares. NULL = apagado.';
