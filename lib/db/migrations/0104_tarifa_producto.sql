-- Cada tarifa puede apuntar al servicio de facturación con el que se cobra.
--
-- Antes el puente concepto→producto vivía en el concepto, y eso solo alcanza
-- para un producto por concepto. Los colegios tienen uno por grado (Andrés
-- Bello llegó a 32 "Pago de colegiatura"), así que la atadura tiene que estar
-- en la tarifa: (concepto, año, nodo) → producto.
--
-- Queda opcional a propósito: un grado que hereda el precio del servicio hereda
-- también su producto, y no necesita fila propia.
ALTER TABLE "admin_escolar_concepto_precios"
  ADD COLUMN IF NOT EXISTS "product_id" integer;
--> statement-breakpoint
ALTER TABLE "admin_escolar_concepto_precios"
  ADD CONSTRAINT "aecp_product_fk" FOREIGN KEY ("product_id")
  REFERENCES "products"("id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "admin_escolar_concepto_precios_product_idx"
  ON "admin_escolar_concepto_precios" ("product_id");
