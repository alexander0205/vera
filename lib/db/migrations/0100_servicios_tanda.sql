-- Servicio = tanda/nivel (como SIGERD): Servicio → Grado → Sección.
CREATE TABLE IF NOT EXISTS "admin_escolar_servicios" (
  "id"                 serial PRIMARY KEY NOT NULL,
  "team_id"            integer NOT NULL,
  "nombre"             varchar(100) NOT NULL,
  "tanda"              varchar(30),
  "orden"              integer DEFAULT 0 NOT NULL,
  "sigerd_servicio_id" integer,
  "activo"             boolean DEFAULT true NOT NULL,
  "created_at"         timestamp DEFAULT now() NOT NULL,
  "updated_at"         timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "admin_escolar_servicios_team_id_teams_id_fk"
    FOREIGN KEY ("team_id") REFERENCES "teams"("id")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "admin_escolar_servicios_team_idx" ON "admin_escolar_servicios" ("team_id");
--> statement-breakpoint
-- Grados/secciones de prueba se descartan para poder poner servicio_id NOT NULL.
DELETE FROM "admin_escolar_cursos";
--> statement-breakpoint
DELETE FROM "admin_escolar_grados";
--> statement-breakpoint
ALTER TABLE "admin_escolar_grados"
  ADD COLUMN IF NOT EXISTS "servicio_id" integer NOT NULL REFERENCES "admin_escolar_servicios"("id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "admin_escolar_grados_servicio_idx" ON "admin_escolar_grados" ("servicio_id");
