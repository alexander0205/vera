-- Sexo del estudiante (administración escolar).
-- Columna OPCIONAL: masculino | femenino | otro. Se captura al crear/editar el
-- estudiante junto a la fecha de nacimiento (la edad se deriva de ésta, no se
-- guarda). Nullable para no romper estudiantes ya existentes.
--
-- Idempotente: IF NOT EXISTS.

ALTER TABLE admin_escolar_estudiantes
  ADD COLUMN IF NOT EXISTS sexo VARCHAR(20);
