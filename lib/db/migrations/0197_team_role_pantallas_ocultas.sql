-- 0197 · Gobernanza: pantallas apagadas por rol.
--
-- Lista negra: una fila = ese rol no ve esa pantalla (ni en el menú ni por
-- URL). Sin filas el rol ve todo, así que ninguna empresa cambia al aplicar
-- esto. El catálogo de pantallas vive en lib/config/pantallas.ts.
--
-- Aditiva e idempotente.

CREATE TABLE IF NOT EXISTS team_role_pantallas_ocultas (
  id            SERIAL PRIMARY KEY,
  team_role_id  INTEGER NOT NULL REFERENCES team_roles(id) ON DELETE CASCADE,
  pantalla      VARCHAR(60) NOT NULL,
  created_at    TIMESTAMP NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS team_role_pantalla_idx
  ON team_role_pantallas_ocultas (team_role_id, pantalla);
