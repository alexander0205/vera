-- 0194 · Asistente de Zero: valoración de cada respuesta (👍 / 👎).
--
-- Es la única forma de saber cómo le va al asistente con gente real: sin esto,
-- la calidad solo se mide con las preguntas que se nos ocurren a nosotros.
-- `valoracion`: 1 = útil, -1 = no útil, NULL = sin valorar.
--
-- Aditiva e idempotente.

ALTER TABLE asistente_mensajes ADD COLUMN IF NOT EXISTS valoracion SMALLINT;
ALTER TABLE asistente_mensajes ADD COLUMN IF NOT EXISTS valoracion_motivo VARCHAR(40);
ALTER TABLE asistente_mensajes ADD COLUMN IF NOT EXISTS valorado_en TIMESTAMP;

-- Para revisar lo que salió mal: las respuestas valoradas negativo, recientes primero.
CREATE INDEX IF NOT EXISTS asistente_msg_valoracion_idx
  ON asistente_mensajes (valorado_en DESC) WHERE valoracion IS NOT NULL;
