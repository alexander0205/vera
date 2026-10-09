-- Jerarquía Período → Servicio → Curso(grado) → Sección: el servicio ahora
-- pertenece a un período. Estructura de prueba desechable se limpia.
DELETE FROM "admin_escolar_cursos";
--> statement-breakpoint
DELETE FROM "admin_escolar_grados";
--> statement-breakpoint
DELETE FROM "admin_escolar_servicios";
--> statement-breakpoint
ALTER TABLE "admin_escolar_servicios"
  ADD COLUMN IF NOT EXISTS "periodo_id" integer NOT NULL REFERENCES "admin_escolar_periodos"("id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "admin_escolar_servicios_periodo_idx" ON "admin_escolar_servicios" ("periodo_id");
