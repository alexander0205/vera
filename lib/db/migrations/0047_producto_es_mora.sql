-- Servicio de sistema "Interés por mora": las ND de mora referencian un
-- producto/servicio del catálogo (reutilizable, no línea suelta de texto).
-- El % de mora sigue viviendo en teams.recargo_mora_porcentaje (fuente única).

ALTER TABLE products ADD COLUMN IF NOT EXISTS es_mora BOOLEAN NOT NULL DEFAULT false;

-- Un solo servicio de mora por team (find-or-create lo garantiza; el índice
-- protege contra carreras a nivel DB).
CREATE UNIQUE INDEX IF NOT EXISTS products_es_mora_unico_idx
  ON products(team_id)
  WHERE es_mora = true;
