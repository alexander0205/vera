-- 0039: Override por factura del recargo por mora.
-- Cuando una factura a crédito se crea con recargo activo, el usuario puede
-- ajustar el % y los días de gracia. NULL = usar el default del team.

ALTER TABLE ecf_documents ADD COLUMN IF NOT EXISTS mora_porcentaje integer;   -- basis points (200 = 2%)
ALTER TABLE ecf_documents ADD COLUMN IF NOT EXISTS mora_dias_gracia integer;  -- días de gracia
