-- 0193 · Asistente de Zero (solo lectura): conversaciones y mensajes.
--
-- Se guarda lo que el asistente consultó para poder auditarlo y para entregar
-- la conversación al agente humano cuando la persona pide hablar con alguien.
-- `herramientas` guarda qué consultas se hicieron en cada respuesta.
--
-- Aditiva e idempotente.

CREATE TABLE IF NOT EXISTS asistente_conversaciones (
  id          SERIAL PRIMARY KEY,
  team_id     INTEGER NOT NULL REFERENCES teams(id),
  user_id     INTEGER NOT NULL REFERENCES users(id),
  titulo      VARCHAR(120),
  creada_en   TIMESTAMP NOT NULL DEFAULT NOW(),
  actualizada_en TIMESTAMP NOT NULL DEFAULT NOW(),
  derivada_ticket_id INTEGER
);

CREATE INDEX IF NOT EXISTS asistente_conv_user_idx
  ON asistente_conversaciones (team_id, user_id, actualizada_en DESC);

CREATE TABLE IF NOT EXISTS asistente_mensajes (
  id              SERIAL PRIMARY KEY,
  conversacion_id INTEGER NOT NULL REFERENCES asistente_conversaciones(id) ON DELETE CASCADE,
  rol             VARCHAR(12) NOT NULL,
  contenido       TEXT NOT NULL,
  herramientas    JSONB,
  creado_en       TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS asistente_msg_conv_idx
  ON asistente_mensajes (conversacion_id, id);
