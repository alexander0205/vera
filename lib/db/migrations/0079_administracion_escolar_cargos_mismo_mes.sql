-- Permitir varios cargos en el mismo mes/período para el mismo estudiante.
--
-- Antes existía un índice único sobre:
--   estudiante_id + concepto_id + periodo_id + COALESCE(mes, 0)
-- Eso impedía registrar más de un cargo del mismo concepto en el mismo mes,
-- aunque fueran cargos distintos. La generación masiva sigue omitiendo
-- duplicados por lógica de aplicación; el cargo individual queda flexible.

DROP INDEX IF EXISTS admin_escolar_cargos_uniq;

CREATE INDEX IF NOT EXISTS admin_escolar_cargos_periodo_idx
  ON admin_escolar_cargos(periodo_id);
