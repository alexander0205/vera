-- Documentos que el colegio le pide a la familia al matricular.
--
-- Dos tablas: lo que se EXIGE (configuración, por nivel y tipo de inscripción)
-- y lo que se ENTREGÓ (por matrícula), más una tercera para los enlaces que se
-- le mandan a la familia para que suba sin entrar al sistema.
--
-- Por qué `nivel` (texto) y no `servicio_id`:
-- los servicios cuelgan de un PERÍODO —hay un "Primario · Matutina" por año
-- escolar—, así que un id apuntaría a la configuración de un año concreto y
-- habría que rehacerla cada agosto. El nivel ("Inicial", "Primario") es lo
-- estable, y es además como lo piensa el colegio.

CREATE TABLE IF NOT EXISTS admin_escolar_documentos_requeridos (
  id                SERIAL PRIMARY KEY,
  team_id           INTEGER NOT NULL REFERENCES teams(id),
  -- NULL = vale para todos los niveles. Si no, se compara con
  -- admin_escolar_servicios.nombre sin distinguir mayúsculas ni acentos.
  nivel             VARCHAR(60),
  -- 'nuevo' | 'reinscripcion'
  tipo_inscripcion  VARCHAR(20) NOT NULL,
  nombre            VARCHAR(160) NOT NULL,
  -- 'requerido'  → hay que entregarlo siempre.
  -- 'si_aplica'  → depende del caso; alguien tiene que decidir y dejar dicho
  --                si aplica o no. No es lo mismo que opcional: un "si aplica"
  --                sin resolver deja la matrícula incompleta.
  exigencia         VARCHAR(20) NOT NULL DEFAULT 'requerido',
  -- "3 fotos 2x2" y "2 fotos 2x2" son el mismo documento con distinto número;
  -- separarlos en dos filas las desincroniza en cuanto se renombra una.
  cantidad          SMALLINT NOT NULL DEFAULT 1,
  orden             SMALLINT NOT NULL DEFAULT 0,
  activo            BOOLEAN NOT NULL DEFAULT TRUE,
  created_at        TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT admin_escolar_docs_req_tipo_chk
    CHECK (tipo_inscripcion IN ('nuevo', 'reinscripcion')),
  CONSTRAINT admin_escolar_docs_req_exigencia_chk
    CHECK (exigencia IN ('requerido', 'si_aplica'))
);

CREATE INDEX IF NOT EXISTS admin_escolar_docs_req_lista_idx
  ON admin_escolar_documentos_requeridos (team_id, tipo_inscripcion, orden);


CREATE TABLE IF NOT EXISTS admin_escolar_documentos_entregados (
  id            SERIAL PRIMARY KEY,
  team_id       INTEGER NOT NULL REFERENCES teams(id),
  -- Cuelga de la MATRÍCULA, no del estudiante: lo que se exige depende del
  -- nivel y de si es nuevo ingreso, y las dos cosas son del año. La pestaña del
  -- estudiante enseña la del año en curso y deja ver las anteriores.
  matricula_id  INTEGER NOT NULL REFERENCES admin_escolar_matriculas(id) ON DELETE CASCADE,
  requerido_id  INTEGER NOT NULL REFERENCES admin_escolar_documentos_requeridos(id) ON DELETE CASCADE,
  -- 'pendiente' | 'recibido' | 'aprobado' | 'rechazado' | 'no_aplica'
  --
  -- 'recibido' y 'aprobado' están separados a propósito: subir el archivo y
  -- darlo por bueno son dos actos de dos personas distintas, y el colegio
  -- necesita saber quién firmó el segundo. Un archivo que llega por el enlace
  -- de la familia entra SIEMPRE como 'recibido', nunca como 'aprobado'.
  estado        VARCHAR(20) NOT NULL DEFAULT 'pendiente',

  -- Archivo. Mismo esquema que pago_adjuntos: 's3' o 'db' (base64) para que
  -- funcione en local sin credenciales.
  archivo_nombre  VARCHAR(255),
  mime            VARCHAR(100),
  tamano_bytes    INTEGER,
  sha256          CHAR(64),
  storage         VARCHAR(10),
  s3_key          TEXT,
  contenido       TEXT,

  subido_en       TIMESTAMP,
  subido_por      INTEGER REFERENCES users(id),
  -- TRUE si entró por el enlace público. `subido_por` va NULL en ese caso: no
  -- hay sesión, y atribuirlo a un empleado sería mentir en el rastro.
  subido_familia  BOOLEAN NOT NULL DEFAULT FALSE,

  aprobado_en     TIMESTAMP,
  aprobado_por    INTEGER REFERENCES users(id),
  -- Motivo del rechazo, o la razón de marcarlo "no aplica".
  motivo          TEXT,
  notas           TEXT,

  created_at    TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT admin_escolar_docs_ent_estado_chk
    CHECK (estado IN ('pendiente', 'recibido', 'aprobado', 'rechazado', 'no_aplica')),
  -- Aprobado sin quién lo aprobó no sirve de rastro.
  CONSTRAINT admin_escolar_docs_ent_aprobador_chk
    CHECK (estado <> 'aprobado' OR (aprobado_por IS NOT NULL AND aprobado_en IS NOT NULL))
);

-- Un documento exigido, una fila por matrícula. La garantía va en la DB porque
-- dos subidas a la vez ven ambas la tabla vacía.
CREATE UNIQUE INDEX IF NOT EXISTS admin_escolar_docs_ent_unico_idx
  ON admin_escolar_documentos_entregados (matricula_id, requerido_id);
CREATE INDEX IF NOT EXISTS admin_escolar_docs_ent_team_idx
  ON admin_escolar_documentos_entregados (team_id, estado);


-- Enlace para que la familia suba sin cuenta.
CREATE TABLE IF NOT EXISTS admin_escolar_documentos_enlaces (
  id            SERIAL PRIMARY KEY,
  team_id       INTEGER NOT NULL REFERENCES teams(id),
  matricula_id  INTEGER NOT NULL REFERENCES admin_escolar_matriculas(id) ON DELETE CASCADE,
  -- Se guarda el SHA-256 del token, no el token. Quien lea la tabla (un dump,
  -- un backup, un empleado con acceso a la base) no puede usarlo para entrar.
  -- El token en claro solo existe una vez: en el enlace que se copia.
  token_hash    CHAR(64) NOT NULL,
  expira_en     TIMESTAMP NOT NULL,
  creado_por    INTEGER REFERENCES users(id),
  creado_en     TIMESTAMP NOT NULL DEFAULT NOW(),
  ultimo_uso_en TIMESTAMP,
  revocado_en   TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS admin_escolar_docs_enlace_token_idx
  ON admin_escolar_documentos_enlaces (token_hash);
CREATE INDEX IF NOT EXISTS admin_escolar_docs_enlace_matricula_idx
  ON admin_escolar_documentos_enlaces (matricula_id);
