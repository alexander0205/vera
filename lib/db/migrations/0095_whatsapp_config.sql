-- Conexión WhatsApp por negocio, vía la API pública de crm-escolar
-- (docs/superpowers/specs/2026-08-03-whatsapp-conexion-envio-design.md).
-- Credenciales cifradas AES-256-GCM (mismo patrón que cert_p12_* en teams).

CREATE TABLE IF NOT EXISTS whatsapp_config (
  id                        serial PRIMARY KEY,
  team_id                   integer NOT NULL UNIQUE REFERENCES teams(id),
  negocio_id                text NOT NULL,

  api_key_ciphered          text NOT NULL,
  api_key_iv                text NOT NULL,
  api_key_auth_tag          text NOT NULL,

  webhook_secret_ciphered   text,
  webhook_secret_iv         text,
  webhook_secret_auth_tag   text,

  conectado                 boolean NOT NULL DEFAULT false,
  numero_whatsapp           text,

  creado_en                 timestamp NOT NULL DEFAULT now(),
  actualizado_en            timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS whatsapp_mensajes (
  id                serial PRIMARY KEY,
  team_id           integer NOT NULL REFERENCES teams(id),
  telefono          text NOT NULL,
  nombre_contacto   text,
  texto             text,
  tipo              text NOT NULL,
  conversation_id   text NOT NULL,
  message_id        text NOT NULL UNIQUE,
  recibido_en       timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS whatsapp_mensajes_team_idx
  ON whatsapp_mensajes (team_id, recibido_en DESC);
