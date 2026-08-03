-- Cotizaciones ahora reusan el formulario de Nueva Factura (mismos componentes),
-- por lo que soportan retenciones, comentario y pie. Se persisten como columnas
-- propias (paralelo a ecf_documents) para poder mostrarlos al reabrir/convertir.
--   retenciones  — JSON string de Retencion[] (mismo shape que ecf_documents.retenciones)
--   comentario   — nota interna libre
--   pie_factura  — pie del documento (texto legal/comercial)
ALTER TABLE "cotizaciones" ADD COLUMN IF NOT EXISTS "retenciones" text;
ALTER TABLE "cotizaciones" ADD COLUMN IF NOT EXISTS "comentario" text;
ALTER TABLE "cotizaciones" ADD COLUMN IF NOT EXISTS "pie_factura" text;
