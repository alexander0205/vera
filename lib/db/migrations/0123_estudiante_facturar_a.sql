-- A quién se le factura, cuando no es el tutor responsable.
--
-- Hasta ahora la factura escolar salía siempre a nombre del tutor marcado como
-- responsable de pago. Eso cubre el caso normal y se rompe en uno muy común:
-- el padre pide que la mensualidad salga a nombre de SU EMPRESA, para
-- deducirla. La empresa no es tutor del alumno —no tiene por qué aparecer en
-- la lista de quién puede recogerlo o firmar permisos— y aun así es a quien
-- hay que facturarle todos los meses.
--
-- Por eso vive aquí y no en `admin_escolar_estudiante_tutores`: no es un
-- vínculo familiar, es una preferencia de facturación. Y va en el estudiante y
-- no en la matrícula porque el acuerdo con la familia no se renegocia cada
-- agosto: se pactó una vez y sigue valiendo el año que viene.
--
-- NULL = lo normal, se le factura al tutor responsable.
ALTER TABLE admin_escolar_estudiantes
  ADD COLUMN IF NOT EXISTS facturar_a_client_id INTEGER REFERENCES clients(id);

COMMENT ON COLUMN admin_escolar_estudiantes.facturar_a_client_id IS
  'Contacto al que se le factura si no es el tutor responsable (p.ej. la empresa del padre). NULL = tutor responsable.';
