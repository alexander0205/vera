-- Tarifas por período + beca (mensualidad pactada) por estudiante.
--
-- Por qué:
--  1) El precio de un concepto cambia cada año escolar. Sin `periodo_id` la
--     única salida era duplicar el catálogo entero cada año (Andrés Bello
--     terminó con 32 productos "Pago de colegiatura" para 16 grados). Con el
--     período, la tarifa vieja se conserva y solo se agrega la nueva.
--  2) La beca no es de la estructura, es de la persona: en una misma sección
--     conviven quien paga tarifa completa y quien tiene un monto pactado. Vive
--     en la matrícula, no en un concepto aparte (hoy el becado se factura
--     contra un producto "Becado" que pierde el rastro del grado).

-- La tabla está vacía en todos los ambientes, así que la columna entra NOT NULL
-- sin necesidad de rellenar.
ALTER TABLE "admin_escolar_concepto_precios"
  ADD COLUMN IF NOT EXISTS "periodo_id" integer NOT NULL;
--> statement-breakpoint
ALTER TABLE "admin_escolar_concepto_precios"
  ADD CONSTRAINT "aecp_periodo_fk" FOREIGN KEY ("periodo_id")
  REFERENCES "admin_escolar_periodos"("id");
--> statement-breakpoint

-- El precio ahora es único por (concepto, período, nodo): el mismo concepto en
-- el mismo grado puede tener un precio distinto en cada año escolar.
DROP INDEX IF EXISTS "admin_escolar_concepto_precios_uniq";
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "admin_escolar_concepto_precios_uniq"
  ON "admin_escolar_concepto_precios"
  ("team_id", "concepto_id", "periodo_id", "objetivo_tipo", "objetivo_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "admin_escolar_concepto_precios_periodo_idx"
  ON "admin_escolar_concepto_precios" ("periodo_id");
--> statement-breakpoint

-- Beca: lo que el estudiante paga de mensualidad, ya pactado. NULL = paga la
-- tarifa que le toque por su grado/servicio. Solo aplica al concepto marcado
-- como recurrente (la colegiatura); inscripción y materiales van completos.
ALTER TABLE "admin_escolar_matriculas"
  ADD COLUMN IF NOT EXISTS "mensualidad_pactada_centavos" integer;
