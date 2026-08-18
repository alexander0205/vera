-- Fase 2: vincula un movimiento de caja al documento (gasto/compra) que lo
-- originó. Permite reconciliar la salida de efectivo al editar el borrador
-- (idempotencia por documento) en vez de acumular movimientos al re-guardar.
-- Nullable: los movimientos manuales (ENTRADA/SALIDA/AJUSTE) no tienen documento.
ALTER TABLE caja_movimientos
  ADD COLUMN IF NOT EXISTS ecf_document_id integer;

CREATE INDEX IF NOT EXISTS caja_movimientos_ecf_document_id_idx
  ON caja_movimientos (ecf_document_id);
