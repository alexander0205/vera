-- URL canónica DGII devuelta por ecf-api (no reconstruir client-side)
ALTER TABLE "ecf_documents" ADD COLUMN IF NOT EXISTS "url_verificacion" text;
