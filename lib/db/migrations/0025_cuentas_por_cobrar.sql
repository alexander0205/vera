-- Migration 0025: Cuentas por cobrar (pagos múltiples por factura) + dias_para_pago en facturas_recurrentes

-- 1. Agregar columna diasParaPago a facturas_recurrentes (recurring credit invoices)
ALTER TABLE facturas_recurrentes
  ADD COLUMN IF NOT EXISTS dias_para_pago integer;

-- 2. Crear tabla pagos_recibidos (un registro por pago, múltiples pagos por ecf_document)
CREATE TABLE IF NOT EXISTS pagos_recibidos (
  id              serial PRIMARY KEY,
  team_id         integer NOT NULL REFERENCES teams(id),
  ecf_document_id integer NOT NULL REFERENCES ecf_documents(id),
  monto_centavos  integer NOT NULL,
  metodo          varchar(30) NOT NULL,
  referencia      varchar(100),
  cuenta          varchar(100),
  fecha_pago      date NOT NULL,
  notas           text,
  created_by      integer REFERENCES users(id),
  created_at      timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS pagos_team_doc_idx    ON pagos_recibidos (team_id, ecf_document_id);
CREATE INDEX IF NOT EXISTS pagos_team_fecha_idx  ON pagos_recibidos (team_id, fecha_pago);

-- 3. Backfill: para facturas que ya tenían pago_recibido='true', crear un registro inicial
--    en pagos_recibidos para preservar el histórico.
INSERT INTO pagos_recibidos (team_id, ecf_document_id, monto_centavos, metodo, cuenta, fecha_pago, notas, created_at)
SELECT
  team_id,
  id,
  pago_valor_cts,
  COALESCE(pago_metodo, 'otro'),
  pago_cuenta,
  COALESCE(NULLIF(pago_fecha, '')::date, created_at::date),
  'Migrado desde pago_recibido legacy',
  created_at
FROM ecf_documents
WHERE pago_recibido = 'true'
  AND pago_valor_cts > 0
  AND NOT EXISTS (
    SELECT 1 FROM pagos_recibidos pr WHERE pr.ecf_document_id = ecf_documents.id
  );
