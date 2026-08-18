-- Fase 2: datos del comprobante recibido al registrar un gasto.
-- Separados del e-NCF propio (`encf`) porque son referencia del proveedor.
ALTER TABLE ecf_documents
  ADD COLUMN IF NOT EXISTS categoria_gasto varchar(100),
  ADD COLUMN IF NOT EXISTS ncf_proveedor varchar(40),
  ADD COLUMN IF NOT EXISTS fecha_gasto date;
