-- Precio de un concepto atado a un nodo de la estructura (servicio/grado/sección).
CREATE TABLE IF NOT EXISTS "admin_escolar_concepto_precios" (
  "id"             serial PRIMARY KEY NOT NULL,
  "team_id"        integer NOT NULL,
  "concepto_id"    integer NOT NULL,
  "objetivo_tipo"  varchar(12) NOT NULL,
  "objetivo_id"    integer NOT NULL,
  "monto_centavos" integer NOT NULL,
  "activo"         boolean DEFAULT true NOT NULL,
  "created_at"     timestamp DEFAULT now() NOT NULL,
  "updated_at"     timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "aecp_team_fk"     FOREIGN KEY ("team_id")     REFERENCES "teams"("id"),
  CONSTRAINT "aecp_concepto_fk" FOREIGN KEY ("concepto_id") REFERENCES "admin_escolar_conceptos_pago"("id")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "admin_escolar_concepto_precios_team_idx" ON "admin_escolar_concepto_precios" ("team_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "admin_escolar_concepto_precios_uniq"
  ON "admin_escolar_concepto_precios" ("team_id", "concepto_id", "objetivo_tipo", "objetivo_id");
