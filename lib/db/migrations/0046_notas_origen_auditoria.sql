-- Notas de crédito/débito: referencia robusta al documento padre + metadatos
-- de modificación, y auditoría updated_by / created_by.

-- 1) Referencia por id al documento padre (NC/ND). Independiente del e-NCF:
--    sobrevive a que el padre borrador (BOR-) sea promovido a e-CF real.
ALTER TABLE ecf_documents ADD COLUMN IF NOT EXISTS origen_documento_id INTEGER REFERENCES ecf_documents(id);
CREATE INDEX IF NOT EXISTS ecf_documents_origen_doc_idx ON ecf_documents(origen_documento_id);

-- 2) Metadatos de modificación DGII (antes solo viajaban al XML, no se persistían)
ALTER TABLE ecf_documents ADD COLUMN IF NOT EXISTS codigo_modificacion INTEGER;
ALTER TABLE ecf_documents ADD COLUMN IF NOT EXISTS razon_modificacion TEXT;

-- 3) Auditoría: último usuario que editó el documento
ALTER TABLE ecf_documents ADD COLUMN IF NOT EXISTS updated_by INTEGER REFERENCES users(id);

-- 4) Auditoría en catálogos: quién creó/editó clientes y productos
ALTER TABLE clients  ADD COLUMN IF NOT EXISTS created_by INTEGER REFERENCES users(id);
ALTER TABLE clients  ADD COLUMN IF NOT EXISTS updated_by INTEGER REFERENCES users(id);
ALTER TABLE products ADD COLUMN IF NOT EXISTS created_by INTEGER REFERENCES users(id);
ALTER TABLE products ADD COLUMN IF NOT EXISTS updated_by INTEGER REFERENCES users(id);

-- 5) Idempotencia de la ND de mora a nivel DB: una sola ND de mora ACTIVA
--    (no anulada) por factura padre. Refuerza la validación en código contra
--    condiciones de carrera del cron.
CREATE UNIQUE INDEX IF NOT EXISTS ecf_documents_mora_activa_unica_idx
  ON ecf_documents(mora_origen_id)
  WHERE mora_origen_id IS NOT NULL AND estado != 'ANULADO';
