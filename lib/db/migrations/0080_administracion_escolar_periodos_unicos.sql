-- Un período escolar se identifica por su nombre dentro del team.
-- Previene catálogos duplicados como "2026-2027" creados por error.
CREATE UNIQUE INDEX IF NOT EXISTS admin_escolar_periodos_team_nombre_uniq
  ON admin_escolar_periodos(team_id, lower(btrim(nombre)));
