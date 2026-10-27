-- 0192 · Plantillas de WhatsApp: para qué aviso se creó cada una.
--
-- Una plantilla recién enviada a Meta tarda de minutos a horas en aprobarse y
-- hasta entonces no se puede asignar a un aviso. `aviso_destino` guarda la
-- intención («esta es para "al-emitir"») y se aplica sola cuando Meta la aprueba.
--
-- Aditiva e idempotente.

ALTER TABLE whatsapp_plantillas ADD COLUMN IF NOT EXISTS aviso_destino VARCHAR(32);
