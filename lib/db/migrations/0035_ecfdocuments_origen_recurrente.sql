-- Migración 0035: marcar qué facturas en ecf_documents vienen de una factura recurrente
-- Permite que AR muestre borradores de origen recurrente (crédito) aunque no estén emitidas.

ALTER TABLE ecf_documents
  ADD COLUMN IF NOT EXISTS origen_recurrente_id integer
    REFERENCES facturas_recurrentes(id) ON DELETE SET NULL;
