-- Personal agregado a mano por el colegio (overlay editable sobre el mirror
-- de solo-lectura sigerd_personal). La sync de SIGERD NUNCA toca esta tabla.
CREATE TABLE IF NOT EXISTS "escolar_personal" (
  "id"                serial PRIMARY KEY NOT NULL,
  "team_id"           integer NOT NULL,
  "sigerd_id_persona" integer,
  "cedula"            varchar(20),
  "nombres"           varchar(160),
  "apellidos"         varchar(160),
  "cargo"             varchar(120),
  "tipo"              varchar(20),
  "estado"            varchar(40) DEFAULT 'Activo' NOT NULL,
  "sexo"              varchar(20),
  "fecha_nacimiento"  date,
  "nacionalidad"      varchar(60),
  "telefono"          varchar(30),
  "email"             varchar(160),
  "notas"             text,
  "created_at"        timestamp DEFAULT now() NOT NULL,
  "updated_at"        timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "escolar_personal_team_id_teams_id_fk"
    FOREIGN KEY ("team_id") REFERENCES "teams"("id")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "escolar_personal_team_idx" ON "escolar_personal" ("team_id");
