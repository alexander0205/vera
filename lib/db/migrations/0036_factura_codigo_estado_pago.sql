-- ─── Código factura legible (F-YYYY-NNNNNN) + estado_pago persistido ──────────
-- Genera un identificador humano por factura, único dentro del team+año.
-- Persiste estado de pago para evitar recalcular en cada query AR.

-- 1. Columna código humano-legible (nullable hasta backfill)
ALTER TABLE ecf_documents
  ADD COLUMN IF NOT EXISTS codigo varchar(20);

-- 2. Counter por team + año (transaccional, evita race en concurrencia)
CREATE TABLE IF NOT EXISTS factura_codigo_counter (
  team_id integer  NOT NULL REFERENCES teams(id),
  anio    smallint NOT NULL,
  ultimo  integer  NOT NULL DEFAULT 0,
  PRIMARY KEY (team_id, anio)
);

-- 3. Estado de pago persistido — antes se calculaba on-the-fly
ALTER TABLE ecf_documents
  ADD COLUMN IF NOT EXISTS estado_pago varchar(20) NOT NULL DEFAULT 'PENDIENTE';
-- Valores: PENDIENTE | PARCIAL | PAGADA | ANULADA | GRATUITA | USO

-- 4. Indices
CREATE INDEX IF NOT EXISTS ecf_docs_estado_pago_idx
  ON ecf_documents (team_id, estado_pago);

CREATE UNIQUE INDEX IF NOT EXISTS ecf_docs_codigo_unique
  ON ecf_documents (team_id, codigo) WHERE codigo IS NOT NULL;

-- 5. Backfill códigos por team, ordenados por fecha de emisión + id
DO $$
DECLARE
  rec     RECORD;
  seq_cur integer;
BEGIN
  FOR rec IN
    SELECT id, team_id, EXTRACT(YEAR FROM fecha_emision)::smallint AS anio
    FROM ecf_documents
    WHERE codigo IS NULL
    ORDER BY team_id, fecha_emision ASC, id ASC
  LOOP
    INSERT INTO factura_codigo_counter (team_id, anio, ultimo)
      VALUES (rec.team_id, rec.anio, 1)
    ON CONFLICT (team_id, anio)
      DO UPDATE SET ultimo = factura_codigo_counter.ultimo + 1
    RETURNING ultimo INTO seq_cur;
    UPDATE ecf_documents
      SET codigo = 'F-' || rec.anio || '-' || LPAD(seq_cur::text, 6, '0')
      WHERE id = rec.id;
  END LOOP;
END $$;

-- 6. Backfill estado_pago según pagos reales + estado + tipo.
--    Para histórico de contado SIN filas de pago, se honra el flag inline
--    `pago_recibido`/`pago_valor_cts` como "pagado" — así no se inunda AR de
--    ventas de contado viejas que sí se cobraron pero nunca registraron pago row.
UPDATE ecf_documents d SET estado_pago = CASE
  WHEN d.estado = 'ANULADO' THEN 'ANULADA'
  WHEN d.tipo_pago = 3      THEN 'GRATUITA'
  WHEN d.tipo_pago = 4      THEN 'USO'
  ELSE
    CASE
      -- Pagos reales del ledger
      WHEN COALESCE((SELECT SUM(p.monto_centavos) FROM pagos_recibidos p
                       WHERE p.ecf_document_id = d.id), 0) >= d.monto_total
           AND d.monto_total > 0
        THEN 'PAGADA'
      WHEN COALESCE((SELECT SUM(p.monto_centavos) FROM pagos_recibidos p
                       WHERE p.ecf_document_id = d.id), 0) > 0
        THEN 'PARCIAL'
      -- Sin filas de pago: histórico contado con flag inline → tratado como pagado
      WHEN d.tipo_pago = 1 AND (d.pago_recibido = 'true' OR d.pago_valor_cts >= d.monto_total)
        THEN 'PAGADA'
      ELSE 'PENDIENTE'
    END
END;
