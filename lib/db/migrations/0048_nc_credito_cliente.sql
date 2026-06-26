-- Saldo a favor del cliente generado por Notas de Crédito (tipo 34).
-- NULL = NC del modelo viejo (reduce el saldo de su factura).
-- NOT NULL = NC del modelo nuevo (no toca la factura; genera crédito del cliente,
--            capado a lo pagado de la factura origen).
ALTER TABLE ecf_documents ADD COLUMN IF NOT EXISTS credito_generado_cents integer;

-- Índice parcial para sumar el crédito de un cliente rápido (solo NCs nuevas).
CREATE INDEX IF NOT EXISTS ecf_documents_credito_cliente_idx
  ON ecf_documents (client_id)
  WHERE credito_generado_cents IS NOT NULL;
