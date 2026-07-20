-- Puente unidireccional: matrícula escolar -> plan genérico de factura.
-- Una matrícula puede tener un único plan mensual; una recurrente escolar no se
-- comparte entre estudiantes.
ALTER TABLE admin_escolar_matriculas
  ADD COLUMN IF NOT EXISTS factura_recurrente_id integer REFERENCES facturas_recurrentes(id),
  ADD COLUMN IF NOT EXISTS concepto_mensualidad_id integer REFERENCES admin_escolar_conceptos_pago(id);

CREATE UNIQUE INDEX IF NOT EXISTS admin_escolar_matriculas_factura_recurrente_uniq
  ON admin_escolar_matriculas(factura_recurrente_id)
  WHERE factura_recurrente_id IS NOT NULL;
