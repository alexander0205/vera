-- Extend tipo_ecf in ecf_documents from varchar(2) to varchar(10)
-- Required to support 'sin-ncf' as tipoEcf for plain invoices (no DGII submission)
ALTER TABLE ecf_documents
  ALTER COLUMN tipo_ecf TYPE varchar(10);
