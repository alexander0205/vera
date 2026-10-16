-- 0196 · Asistente de Zero: quién contestó cada respuesta.
--
-- 'local' = el contestador automático (sin IA), 'ia' = el modelo. Sirve para
-- ofrecer «Preguntar a la IA» solo en las respuestas automáticas y para medir
-- qué parte de las preguntas se resuelve sin IA.
--
-- Aditiva e idempotente.

ALTER TABLE asistente_mensajes ADD COLUMN IF NOT EXISTS origen VARCHAR(8);
