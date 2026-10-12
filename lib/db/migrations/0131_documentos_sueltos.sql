-- Documentos colgados de UN alumno, y renglones que son un formulario.
--
-- Hasta ahora un renglón del checklist solo podía venir del listado del nivel:
-- todo lo que se le pedía a un alumno se le pedía a todos los de su lista. Pero
-- media secretaría son casos sueltos —una carta del pediatra, un permiso de
-- viaje, el papel que a ESTE niño le falta— y meterlos en el listado se lo
-- pedía de golpe a los otros trescientos.
--
-- `matricula_id` NULL = lo de siempre, un documento del listado.
-- `matricula_id` puesto = solo se le pide a esa matrícula.
--
-- `formulario_id` convierte el renglón en un formulario del constructor: no se
-- sube un papel, se le manda un enlace a la familia y lo contesta.

ALTER TABLE admin_escolar_documentos_requeridos
  ADD COLUMN IF NOT EXISTS matricula_id  integer REFERENCES admin_escolar_matriculas(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS formulario_id integer REFERENCES admin_escolar_formularios(id) ON DELETE SET NULL;

-- Los extras de una matrícula se leen en cada apertura de su expediente.
CREATE INDEX IF NOT EXISTS admin_escolar_docs_req_matricula_idx
  ON admin_escolar_documentos_requeridos (matricula_id)
  WHERE matricula_id IS NOT NULL;

-- El mismo formulario dos veces en el mismo expediente es un descuido, no una
-- intención: serían dos enlaces vivos para la misma familia y dos respuestas
-- que alguien tendría que comparar.
CREATE UNIQUE INDEX IF NOT EXISTS admin_escolar_docs_req_form_matricula_idx
  ON admin_escolar_documentos_requeridos (matricula_id, formulario_id)
  WHERE matricula_id IS NOT NULL AND formulario_id IS NOT NULL;
