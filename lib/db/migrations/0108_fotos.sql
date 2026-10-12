-- Fotos reutilizables por entidad + sesiones de captura desde el móvil.
--
-- La foto NO vive como columna en cada tabla (estudiantes, personal, products,
-- teams) por dos razones: 1) el componente sería distinto para cada entidad y
-- el requisito es que sea uno solo; 2) el fallback sin S3 guarda un data-URL de
-- ~80 KB, y eso dentro de admin_escolar_estudiantes engordaría cada SELECT de
-- la lista de estudiantes aunque nadie pinte la foto.

CREATE TABLE IF NOT EXISTS fotos (
  id             SERIAL PRIMARY KEY,
  team_id        INTEGER NOT NULL REFERENCES teams(id),
  -- Clave del registro de entidades (lib/fotos/entidades.ts): 'estudiante',
  -- 'personal', 'producto', 'empresa'. Se valida en la app, no con un enum de
  -- Postgres: dar de alta una entidad nueva no debe exigir migración.
  entidad        VARCHAR(30) NOT NULL,
  entidad_id     INTEGER NOT NULL,
  -- Ref de lib/fotos/storage.ts: 's3:<key>' o 'data:image/jpeg;base64,…'.
  ref            TEXT NOT NULL,
  ref_miniatura  TEXT,
  bytes          INTEGER NOT NULL DEFAULT 0,
  ancho          INTEGER,
  alto           INTEGER,
  -- 'movil' (QR) | 'archivo' (subida desde el escritorio).
  origen         VARCHAR(20) NOT NULL DEFAULT 'archivo',
  subida_por     INTEGER REFERENCES users(id),
  created_at     TIMESTAMP NOT NULL DEFAULT now(),
  updated_at     TIMESTAMP NOT NULL DEFAULT now()
);

-- Una sola foto vigente por entidad: reemplazar es un UPSERT sobre esta clave,
-- así dos capturas simultáneas no dejan dos filas peleándose por ser la buena.
CREATE UNIQUE INDEX IF NOT EXISTS fotos_entidad_uniq
  ON fotos (team_id, entidad, entidad_id);

CREATE TABLE IF NOT EXISTS fotos_sesiones (
  id           SERIAL PRIMARY KEY,
  team_id      INTEGER NOT NULL REFERENCES teams(id),
  entidad      VARCHAR(30) NOT NULL,
  entidad_id   INTEGER NOT NULL,
  -- Solo el SHA-256 del token. El token en claro existe únicamente dentro del
  -- QR y de la URL del teléfono: un volcado de la base no abre ninguna cámara.
  token_hash   CHAR(64) NOT NULL,
  expira_en    TIMESTAMP NOT NULL,
  -- Un solo uso: al subir la foto se sella y el token queda muerto.
  usada_en     TIMESTAMP,
  foto_id      INTEGER REFERENCES fotos(id) ON DELETE SET NULL,
  creada_por   INTEGER REFERENCES users(id),
  created_at   TIMESTAMP NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS fotos_sesiones_token_uniq
  ON fotos_sesiones (token_hash);
-- Para la limpieza periódica de sesiones muertas.
CREATE INDEX IF NOT EXISTS fotos_sesiones_expira_idx
  ON fotos_sesiones (expira_en);
