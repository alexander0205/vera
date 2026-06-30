-- Marca si ya se descontó stock para un ecf_document (borrador o emitido).
-- Necesario porque ahora el descuento ocurre al GUARDAR (incluido borrador),
-- no solo al emitir — /anular y /emitir-ecf necesitan saber si ya se aplicó.
ALTER TABLE ecf_documents
  ADD COLUMN IF NOT EXISTS stock_descontado boolean NOT NULL DEFAULT false;
