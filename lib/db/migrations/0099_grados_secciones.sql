-- Modelo Grado → Sección (como SIGERD). El "curso" pasa a ser la SECCIÓN de un
-- grado. Los datos legacy de cursos se descartan (0 matrículas/cargos).

CREATE TABLE IF NOT EXISTS "admin_escolar_grados" (
  "id"              serial PRIMARY KEY NOT NULL,
  "team_id"         integer NOT NULL,
  "nombre"          varchar(100) NOT NULL,
  "nivel"           varchar(80),
  "orden"           integer DEFAULT 0 NOT NULL,
  "sigerd_grado_id" integer,
  "activo"          boolean DEFAULT true NOT NULL,
  "created_at"      timestamp DEFAULT now() NOT NULL,
  "updated_at"      timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "admin_escolar_grados_team_id_teams_id_fk"
    FOREIGN KEY ("team_id") REFERENCES "teams"("id")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "admin_escolar_grados_team_idx" ON "admin_escolar_grados" ("team_id");
--> statement-breakpoint
-- Cursos legacy desechables → tabla vacía para poder agregar grado_id NOT NULL.
DELETE FROM "admin_escolar_cursos";
--> statement-breakpoint
ALTER TABLE "admin_escolar_cursos"
  ADD COLUMN IF NOT EXISTS "grado_id" integer NOT NULL REFERENCES "admin_escolar_grados"("id"),
  ADD COLUMN IF NOT EXISTS "cupo" integer;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "admin_escolar_cursos_grado_idx" ON "admin_escolar_cursos" ("grado_id");
