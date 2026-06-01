-- Migration 0033: Add descripcion to clients + create dependientes table

ALTER TABLE clients ADD COLUMN IF NOT EXISTS descripcion text;

CREATE TABLE IF NOT EXISTS dependientes (
  id          serial PRIMARY KEY,
  team_id     integer NOT NULL REFERENCES teams(id),
  client_id   integer NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  nombre      varchar(120) NOT NULL,
  apellido    varchar(120) NOT NULL,
  created_at  timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS dependientes_client_idx ON dependientes(client_id);
