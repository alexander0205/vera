-- Un único año escolar activo por colegio.
--
-- El activo es el que manda en toda la app: contra él se matricula, se cobra y
-- se resuelven las tarifas. Con dos activos la pregunta "¿en qué año estamos?"
-- deja de tener respuesta y cada pantalla elige uno distinto. Hasta ahora era
-- solo una convención de la UI, así que se coló un segundo activo.

-- Primero se deja uno solo. Sobrevive el que parece el año en curso de verdad:
-- el que tiene calendario, y entre esos el más reciente.
WITH elegido AS (
  SELECT DISTINCT ON (team_id) id, team_id
  FROM admin_escolar_periodos
  WHERE activo
  ORDER BY team_id,
           (fecha_inicio IS NOT NULL) DESC,
           fecha_inicio DESC NULLS LAST,
           id DESC
)
UPDATE admin_escolar_periodos p
SET activo = false, updated_at = now()
WHERE p.activo
  AND p.id <> (SELECT e.id FROM elegido e WHERE e.team_id = p.team_id);
--> statement-breakpoint

-- Y ahora la regla vive en la base, no en la buena voluntad de quien escriba
-- el próximo endpoint.
CREATE UNIQUE INDEX IF NOT EXISTS "admin_escolar_periodos_un_activo"
  ON "admin_escolar_periodos" ("team_id")
  WHERE "activo";
