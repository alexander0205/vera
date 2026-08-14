-- Avisos que no son de cobro.
--
-- La tabla nació para los recordatorios de pago, así que exigía un `cargo_id`:
-- todo aviso tenía que colgar de una cuota. Pero al colegio le mandamos más
-- cosas —el enlace para subir documentos, el formulario de admisión— y hoy esos
-- envíos no dejan rastro en ninguna parte. Cuando la familia dice «a mí no me
-- mandaron nada», la secretaria no tiene qué enseñar.
--
-- `cargo_id` pasa a ser opcional y aparece `matricula_id`: un aviso cuelga de
-- una cuota (cobro) o de una matrícula (expediente), pero de una de las dos.

ALTER TABLE admin_escolar_avisos_enviados
  ALTER COLUMN cargo_id DROP NOT NULL;

ALTER TABLE admin_escolar_avisos_enviados
  ADD COLUMN IF NOT EXISTS matricula_id integer REFERENCES admin_escolar_matriculas(id) ON DELETE CASCADE,
  -- Qué se mandó, en palabras: «Acta de nacimiento», «Ficha de datos». Sin
  -- esto, el historial diría solo «documentos» y no serviría de constancia.
  ADD COLUMN IF NOT EXISTS detalle varchar(200);

-- 'documentos' y 'formulario' no cabían en los 12 caracteres de antes por poco;
-- se amplía para no volver a tocarlo al siguiente tipo de aviso.
ALTER TABLE admin_escolar_avisos_enviados
  ALTER COLUMN tipo TYPE varchar(20);

-- Un aviso que no cuelga de nada no se puede enseñar en ninguna ficha.
ALTER TABLE admin_escolar_avisos_enviados
  DROP CONSTRAINT IF EXISTS admin_escolar_avisos_origen_chk;
ALTER TABLE admin_escolar_avisos_enviados
  ADD CONSTRAINT admin_escolar_avisos_origen_chk
  CHECK (cargo_id IS NOT NULL OR matricula_id IS NOT NULL);

CREATE INDEX IF NOT EXISTS admin_escolar_avisos_matricula_idx
  ON admin_escolar_avisos_enviados (matricula_id, enviado_at DESC)
  WHERE matricula_id IS NOT NULL;
