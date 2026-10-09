-- Borradores de formulario público.
--
-- La ficha de admisión son 91 campos repartidos en 7 pasos. Sin esto, un padre
-- que la abre en el teléfono y se queda sin batería a mitad vuelve a empezar
-- desde cero — y en la práctica no vuelve.
--
-- El borrador es la MISMA fila que acabará siendo la respuesta: se crea vacía
-- con estado 'borrador' y se va rellenando; al enviarla pasa a 'pendiente'.
-- Así no hay dos tablas que puedan discrepar sobre qué contestó la familia.
--
-- `token` es la única credencial del enlace de continuación, por eso va único
-- y NO se deriva del id: con un id secuencial cualquiera contaría 1, 2, 3 y
-- leería las fichas de los demás.

ALTER TABLE admin_escolar_formulario_respuestas
  ADD COLUMN IF NOT EXISTS token      varchar(43),
  ADD COLUMN IF NOT EXISTS pagina     integer   NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS enviado_en timestamp,
  ADD COLUMN IF NOT EXISTS updated_at timestamp NOT NULL DEFAULT now();

-- Lo ya enviado antes de que existieran los borradores se envió al crearse.
UPDATE admin_escolar_formulario_respuestas
   SET enviado_en = created_at
 WHERE enviado_en IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS admin_escolar_form_resp_token_idx
  ON admin_escolar_formulario_respuestas (token)
  WHERE token IS NOT NULL;

-- El CHECK de estado no conocía 'borrador' y rechazaba la fila entera.
ALTER TABLE admin_escolar_formulario_respuestas
  DROP CONSTRAINT IF EXISTS admin_escolar_form_resp_estado_chk;
ALTER TABLE admin_escolar_formulario_respuestas
  ADD CONSTRAINT admin_escolar_form_resp_estado_chk
  CHECK (estado IN ('borrador', 'pendiente', 'aplicada', 'rechazada'));

-- Un borrador sin token es una ficha inalcanzable: nadie puede volver a ella
-- y tampoco le llega al colegio. Que no se pueda crear.
ALTER TABLE admin_escolar_formulario_respuestas
  DROP CONSTRAINT IF EXISTS admin_escolar_form_resp_borrador_chk;
ALTER TABLE admin_escolar_formulario_respuestas
  ADD CONSTRAINT admin_escolar_form_resp_borrador_chk
  CHECK (estado <> 'borrador' OR token IS NOT NULL);

-- Para barrer los borradores viejos sin escanear las respuestas de verdad.
CREATE INDEX IF NOT EXISTS admin_escolar_form_resp_borradores_idx
  ON admin_escolar_formulario_respuestas (formulario_id, updated_at)
  WHERE estado = 'borrador';
