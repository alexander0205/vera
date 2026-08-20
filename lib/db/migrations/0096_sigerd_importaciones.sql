-- Integración SIGERD: snapshot fiel + candado de sync + personal + enlaces.

CREATE TABLE IF NOT EXISTS "sigerd_importaciones" (
  "id"             serial PRIMARY KEY NOT NULL,
  "team_id"        integer NOT NULL,
  "id_centro"      integer NOT NULL,
  "id_regional"    integer,
  "id_distrito"    integer,
  "ano_academico"  integer NOT NULL,
  "estado"         varchar(20) DEFAULT 'pendiente' NOT NULL,
  "mensaje"        text,
  "dump"           jsonb,
  "n_estudiantes"  integer,
  "n_secciones"    integer,
  "n_empleados"    integer,
  "iniciado_en"    timestamp,
  "completado_en"  timestamp,
  "created_at"     timestamp DEFAULT now() NOT NULL,
  "updated_at"     timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "sigerd_personal" (
  "id"               serial PRIMARY KEY NOT NULL,
  "team_id"          integer NOT NULL,
  "id_centro"        integer NOT NULL,
  "sigerd_id_persona" integer NOT NULL,
  "cedula"           varchar(20),
  "nombres"          varchar(160),
  "apellidos"        varchar(160),
  "cargo"            varchar(120),
  "estado"           varchar(40),
  "sexo"             varchar(20),
  "fecha_nacimiento" date,
  "nacionalidad"     varchar(60),
  "telefono"         varchar(30),
  "email"            varchar(160),
  "created_at"       timestamp DEFAULT now() NOT NULL,
  "updated_at"       timestamp DEFAULT now() NOT NULL
);

DO $$ BEGIN
  ALTER TABLE "sigerd_importaciones" ADD CONSTRAINT "sigerd_importaciones_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "teams"("id");
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "sigerd_personal" ADD CONSTRAINT "sigerd_personal_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "teams"("id");
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "sigerd_importaciones_centro_ano_uniq" ON "sigerd_importaciones" ("team_id","id_centro","ano_academico");
CREATE INDEX IF NOT EXISTS "sigerd_importaciones_team_idx" ON "sigerd_importaciones" ("team_id");
CREATE INDEX IF NOT EXISTS "sigerd_importaciones_estado_idx" ON "sigerd_importaciones" ("estado");
CREATE UNIQUE INDEX IF NOT EXISTS "sigerd_personal_persona_uniq" ON "sigerd_personal" ("team_id","sigerd_id_persona");
CREATE INDEX IF NOT EXISTS "sigerd_personal_team_idx" ON "sigerd_personal" ("team_id");

-- Enlaces estables para proyección idempotente
ALTER TABLE "admin_escolar_estudiantes" ADD COLUMN IF NOT EXISTS "sigerd_id" integer;
ALTER TABLE "admin_escolar_cursos"      ADD COLUMN IF NOT EXISTS "sigerd_seccion_id" integer;
ALTER TABLE "admin_escolar_matriculas"  ADD COLUMN IF NOT EXISTS "sigerd_condicion" varchar(40);

CREATE INDEX IF NOT EXISTS "admin_escolar_estudiantes_sigerd_idx" ON "admin_escolar_estudiantes" ("team_id","sigerd_id");
CREATE INDEX IF NOT EXISTS "admin_escolar_cursos_sigerd_idx" ON "admin_escolar_cursos" ("team_id","sigerd_seccion_id");
