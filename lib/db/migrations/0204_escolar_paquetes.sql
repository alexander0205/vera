-- 0204 · Paquetes de conceptos.
--
-- Un paquete es una lista de conceptos con nombre («Horario regular»,
-- «Horario extendido», «Registro SIGERD»…): al matricular, o en la cuadrícula
-- de servicios, se le asigna a un niño o a muchos de una vez en vez de marcar
-- concepto por concepto. No guarda precios: cada concepto cobra su tarifa.
--
-- Aditiva e idempotente.

CREATE TABLE IF NOT EXISTS admin_escolar_paquetes (
  id            SERIAL PRIMARY KEY,
  team_id       INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  nombre        VARCHAR(80) NOT NULL,
  descripcion   VARCHAR(200),
  conceptos_ids INTEGER[] NOT NULL DEFAULT '{}',
  orden         INTEGER NOT NULL DEFAULT 0,
  activo        BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMP NOT NULL DEFAULT now(),
  updated_at    TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS admin_escolar_paquetes_team_idx ON admin_escolar_paquetes (team_id);
