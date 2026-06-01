-- Migration 0034: agregar dependiente_id y dependiente_nombre a ecf_documents
ALTER TABLE ecf_documents ADD COLUMN IF NOT EXISTS dependiente_id integer REFERENCES dependientes(id) ON DELETE SET NULL;
ALTER TABLE ecf_documents ADD COLUMN IF NOT EXISTS dependiente_nombre varchar(255);
