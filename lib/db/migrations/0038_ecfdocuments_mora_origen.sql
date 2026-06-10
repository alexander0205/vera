-- 0038: Nota de débito por mora (borrador interna, no DGII).
-- Cada ND de mora apunta al ecf_document padre que la originó.
ALTER TABLE ecf_documents ADD COLUMN IF NOT EXISTS mora_origen_id integer REFERENCES ecf_documents(id);
CREATE INDEX IF NOT EXISTS ecf_docs_mora_origen_idx ON ecf_documents(mora_origen_id);
