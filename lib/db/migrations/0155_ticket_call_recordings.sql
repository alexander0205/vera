-- lib/db/migrations/0152_ticket_call_recordings.sql
-- Grabación de llamadas de soporte — ver
-- docs/superpowers/specs/2026-08-21-grabacion-llamadas-soporte-design.md
--
-- Un archivo por lado (user/agent) por llamada, y potencialmente varios
-- SEGMENTOS por lado si compartir pantalla arrancó/paró a mitad de llamada
-- (ver el plan: MediaRecorder se reinicia en vez de mutar un stream en vivo,
-- así que puede haber más de una fila por callId+role). Sin política de
-- borrado — se guardan indefinidamente, mismo criterio que el resto de los
-- adjuntos de este feature.

CREATE TABLE IF NOT EXISTS ticket_call_recordings (
  id SERIAL PRIMARY KEY,
  call_id INTEGER NOT NULL REFERENCES ticket_calls(id) ON DELETE CASCADE,
  role VARCHAR(10) NOT NULL,
  s3_key VARCHAR(500) NOT NULL,
  duracion_segundos INTEGER NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ticket_call_recordings_call_idx
  ON ticket_call_recordings (call_id, created_at);
