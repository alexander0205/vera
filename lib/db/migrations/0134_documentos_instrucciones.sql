-- Instrucciones por documento.
--
-- «Acta de nacimiento» no dice si vale una copia, si tiene que llevar sello, ni
-- que hacen falta las dos caras. La familia manda lo que entiende, alguien lo
-- rechaza, y vuelta a empezar: cada ida y vuelta son días de matrícula parada.
-- Esto es lo que se le enseña a la familia junto al nombre del documento, en el
-- enlace y en el correo.

ALTER TABLE admin_escolar_documentos_requeridos
  ADD COLUMN IF NOT EXISTS ayuda varchar(300);

COMMENT ON COLUMN admin_escolar_documentos_requeridos.ayuda IS
  'Lo que la familia necesita saber para no mandarlo mal. Se le enseña a ella, no al colegio.';
