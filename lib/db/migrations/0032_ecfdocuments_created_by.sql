-- Migration 0032: add created_by to ecf_documents
ALTER TABLE ecf_documents ADD COLUMN IF NOT EXISTS created_by integer REFERENCES users(id);
