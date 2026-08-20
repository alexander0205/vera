-- Saber si el aviso LLEGÓ, no solo si se mandó.
--
-- El CRM devuelve 201 con un wamid cuando Meta ACEPTA la petición. Eso no es
-- entrega. Comprobado el 2026-08-17: cuatro avisos devolvieron `ok:true` y los
-- cuatro fallaron después con `131042 Business eligibility payment issue` — la
-- WABA no tenía método de pago. El padre no recibió nada.
--
-- Y como `admin_escolar_avisos_enviados` es la tabla de idempotencia, esos
-- cuatro quedaron marcados como enviados PARA SIEMPRE: el cron no los reintenta
-- nunca, porque su índice único dice que ya salieron. El colegio cree que avisó.
--
-- Con el wamid guardado se puede volver a preguntar (`GET /api/v1/messages`
-- trae `deliveryStatus` y `errorDelivery`) y soltar la reserva de los que
-- fallaron, para que la corrida siguiente los reintente.

ALTER TABLE admin_escolar_avisos_enviados
  ADD COLUMN IF NOT EXISTS mensaje_id     varchar(80),
  -- enviado | entregado | leido | fallido · NULL = todavía no se ha preguntado
  ADD COLUMN IF NOT EXISTS estado_entrega varchar(16),
  -- El motivo real de Meta: distingue «no tiene WhatsApp» de «fuera de la
  -- ventana» de «la cuenta no puede cobrar». Sin esto solo queda adivinar.
  ADD COLUMN IF NOT EXISTS error_entrega  text,
  ADD COLUMN IF NOT EXISTS revisado_at    timestamp;

-- Los que hay que ir a preguntar: mandados por un canal con acuse y sin
-- respuesta todavía.
CREATE INDEX IF NOT EXISTS admin_escolar_avisos_por_revisar
  ON admin_escolar_avisos_enviados (team_id, enviado_at)
  WHERE mensaje_id IS NOT NULL AND estado_entrega IS DISTINCT FROM 'leido'
    AND estado_entrega IS DISTINCT FROM 'entregado';
