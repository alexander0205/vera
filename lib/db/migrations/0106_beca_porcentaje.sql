-- La beca, como la nombra un colegio.
--
-- Antes era un solo monto pactado. Pero los colegios no hablan de montos, hablan
-- de "media beca" y "beca completa": el descuento se pacta en porcentaje y se
-- sostiene solo cuando sube la tarifa. El monto fijo se conserva porque también
-- existe — Andrés Bello tiene becados a RD$300 sobre una tarifa de 3,300, que no
-- es ningún porcentaje redondo.
--
-- La columna anterior estaba vacía en todos los ambientes, así que se reemplaza
-- sin migrar datos.
ALTER TABLE "admin_escolar_matriculas"
  DROP COLUMN IF EXISTS "mensualidad_pactada_centavos";
--> statement-breakpoint

-- 'porcentaje' → beca_valor es el % que se descuenta (50 = media beca, 100 = completa)
-- 'monto'      → beca_valor es lo que paga, en centavos
ALTER TABLE "admin_escolar_matriculas"
  ADD COLUMN IF NOT EXISTS "beca_tipo" varchar(12);
--> statement-breakpoint
ALTER TABLE "admin_escolar_matriculas"
  ADD COLUMN IF NOT EXISTS "beca_valor" integer;
--> statement-breakpoint

-- Sin el motivo, dentro de seis meses nadie sabe por qué este estudiante paga
-- menos, que es justo lo que pregunta quien audita.
ALTER TABLE "admin_escolar_matriculas"
  ADD COLUMN IF NOT EXISTS "beca_motivo" varchar(80);
--> statement-breakpoint

ALTER TABLE "admin_escolar_matriculas"
  ADD CONSTRAINT "admin_escolar_matriculas_beca_chk" CHECK (
    ("beca_tipo" IS NULL AND "beca_valor" IS NULL)
    OR ("beca_tipo" = 'porcentaje' AND "beca_valor" BETWEEN 1 AND 100)
    OR ("beca_tipo" = 'monto' AND "beca_valor" >= 0)
  );
