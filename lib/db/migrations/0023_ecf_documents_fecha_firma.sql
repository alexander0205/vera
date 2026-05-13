-- Persistir fechaHoraFirma directo de ecf-api (evita parsear xmlFirmado en cada PDF render)
ALTER TABLE "ecf_documents" ADD COLUMN IF NOT EXISTS "fecha_firma" varchar(30);
