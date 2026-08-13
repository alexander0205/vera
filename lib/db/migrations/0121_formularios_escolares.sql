-- Formularios que el colegio arma a mano (ficha de inscripción, permisos,
-- encuestas) y las respuestas que llegan de las familias.
--
-- Portado del constructor del CRM (crm-escolar), que es Mongo: allí un
-- formulario es un documento con `campos: ICampo[]` embebido. Aquí los campos
-- van en JSONB por la misma razón que allí van embebidos —se leen y se guardan
-- siempre enteros, nunca se consulta "dame los formularios que tengan un campo
-- de tipo firma"— pero la RESPUESTA no se queda solo en un blob: los campos con
-- `mapaA` bajan a las columnas de verdad del estudiante y del tutor.
--
-- Esa es la diferencia deliberada con el CRM. Allí una respuesta es un lead y
-- un blob basta. Aquí una respuesta trae alergias y quién puede recoger a un
-- menor: eso hay que poder consultarlo, no bucearlo.

CREATE TABLE IF NOT EXISTS admin_escolar_formularios (
  id            SERIAL PRIMARY KEY,
  team_id       INTEGER NOT NULL REFERENCES teams(id),
  nombre        VARCHAR(200) NOT NULL,
  descripcion   TEXT,
  -- Parte de la URL pública: /f/<slug>. Único por colegio, no global, para que
  -- dos colegios puedan tener los dos su "inscripcion-2026".
  slug          VARCHAR(120) NOT NULL,
  activo        BOOLEAN NOT NULL DEFAULT TRUE,
  -- ICampo[] — el mismo vocabulario de tipos que el constructor del CRM.
  campos        JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- Colores, logo, mensaje de confirmación, expiración, tope de envíos.
  configuracion JSONB NOT NULL DEFAULT '{}'::jsonb,
  vistas        INTEGER NOT NULL DEFAULT 0,
  envios        INTEGER NOT NULL DEFAULT 0,
  creado_por    INTEGER REFERENCES users(id),
  created_at    TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS admin_escolar_formularios_slug_idx
  ON admin_escolar_formularios (team_id, slug);
CREATE INDEX IF NOT EXISTS admin_escolar_formularios_team_idx
  ON admin_escolar_formularios (team_id, activo);


CREATE TABLE IF NOT EXISTS admin_escolar_formulario_respuestas (
  id             SERIAL PRIMARY KEY,
  team_id        INTEGER NOT NULL REFERENCES teams(id),
  formulario_id  INTEGER NOT NULL REFERENCES admin_escolar_formularios(id) ON DELETE CASCADE,
  -- El nombre se copia al responder: si después renombran el formulario, la
  -- respuesta sigue diciendo a qué contestó la familia.
  formulario_nombre VARCHAR(200) NOT NULL,
  -- A quién se refiere, cuando se sabe. NULL si llegó por un enlace abierto y
  -- todavía nadie la ha emparejado con un alumno.
  estudiante_id  INTEGER REFERENCES admin_escolar_estudiantes(id) ON DELETE SET NULL,
  matricula_id   INTEGER REFERENCES admin_escolar_matriculas(id) ON DELETE SET NULL,
  -- Todas las respuestas, por id de campo. Lo accesorio se queda aquí; lo que
  -- tiene `mapaA` además se escribe en su columna real.
  datos          JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- 'pendiente' | 'aplicada' | 'rechazada'
  --
  -- Una respuesta NO toca la ficha del alumno hasta que alguien la revisa.
  -- Aplicar automáticamente lo que escribe un padre en un formulario público
  -- dejaría que cualquiera con el enlace reescribiera la dirección o el
  -- teléfono de un menor.
  estado         VARCHAR(20) NOT NULL DEFAULT 'pendiente',
  aplicada_en    TIMESTAMP,
  aplicada_por   INTEGER REFERENCES users(id),
  motivo         TEXT,
  -- Para rastrear un envío raro. No se usa para identificar a nadie.
  ip             VARCHAR(60),
  user_agent     TEXT,
  created_at     TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT admin_escolar_form_resp_estado_chk
    CHECK (estado IN ('pendiente', 'aplicada', 'rechazada')),
  CONSTRAINT admin_escolar_form_resp_aplicador_chk
    CHECK (estado <> 'aplicada' OR (aplicada_por IS NOT NULL AND aplicada_en IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS admin_escolar_form_resp_form_idx
  ON admin_escolar_formulario_respuestas (formulario_id, created_at DESC);
CREATE INDEX IF NOT EXISTS admin_escolar_form_resp_estudiante_idx
  ON admin_escolar_formulario_respuestas (estudiante_id);
CREATE INDEX IF NOT EXISTS admin_escolar_form_resp_pendientes_idx
  ON admin_escolar_formulario_respuestas (team_id, estado);
