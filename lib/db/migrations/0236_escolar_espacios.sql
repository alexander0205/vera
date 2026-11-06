-- 0236 · Planta física del colegio: espacios (aulas, laboratorio, oficinas…) y el
-- inventario por aula.
--
-- Hasta ahora una «sección» (grado + letra) era lo más cercano a un salón, y un
-- activo fijo solo sabía su ubicación en texto libre. Lo que pidió el dueño:
--   · saber qué aulas tiene el colegio y qué secciones comparten cada una (una
--     misma aula sirve a 1.º A en la mañana y a 1.º B en la tarde);
--   · ligar cada ficha de activo fijo a su espacio y ver cuánto hay invertido en
--     cada aula, cuánto vale hoy y cuánto por estudiante;
--   · llevar la cuenta de cosas baratas que no se deprecian (marcadores, sillas
--     de plástico), que van al gasto pero se quieren contar;
--   · el estado de cada bien (bien / regular / dañado) y mover unidades de un aula
--     a otra dejando historia.
--
-- Todo es nuevo o aditivo y NADA se agrega a `users` ni a `admin_escolar_cursos`
-- (se leen con select * en cada petición): la asignación sección → espacio vive en
-- una tabla puente. Las columnas nuevas de `contabilidad_activos_fijos` son
-- opcionales o con valor por defecto: las fichas que ya existen quedan igual
-- (sin aula, con depreciación, estado «bien»).
--
-- Aditiva e idempotente: se puede correr dos veces.

-- 1. Espacios físicos del colegio.
CREATE TABLE IF NOT EXISTS escolar_espacios (
  id                      serial PRIMARY KEY,
  team_id                 integer NOT NULL REFERENCES teams(id),
  -- «Aula 1», «Laboratorio de ciencias».
  nombre                  varchar(120) NOT NULL,
  -- aula | laboratorio | biblioteca | oficina | transporte | general | otro
  tipo                    varchar(20) NOT NULL DEFAULT 'aula',
  -- Cuántas personas caben (opcional).
  capacidad               integer,
  -- Quién responde por lo que hay dentro (opcional). Si la persona se borra, el espacio queda sin responsable.
  responsable_personal_id integer REFERENCES escolar_personal(id) ON DELETE SET NULL,
  activo                  boolean NOT NULL DEFAULT true,
  created_at              timestamp NOT NULL DEFAULT now(),
  updated_at              timestamp NOT NULL DEFAULT now(),
  CONSTRAINT escolar_espacios_tipo_chk CHECK (tipo IN ('aula', 'laboratorio', 'biblioteca', 'oficina', 'transporte', 'general', 'otro')),
  CONSTRAINT escolar_espacios_capacidad_chk CHECK (capacidad IS NULL OR capacidad >= 0)
);
CREATE INDEX IF NOT EXISTS escolar_espacios_team_idx ON escolar_espacios (team_id);

-- 2. Qué secciones usan cada espacio. Una sección está en un solo espacio
--    (UNIQUE curso_id); un espacio puede tener varias secciones (mañana y tarde).
CREATE TABLE IF NOT EXISTS escolar_espacio_secciones (
  id          serial PRIMARY KEY,
  team_id     integer NOT NULL REFERENCES teams(id),
  espacio_id  integer NOT NULL REFERENCES escolar_espacios(id) ON DELETE CASCADE,
  curso_id    integer NOT NULL REFERENCES admin_escolar_cursos(id) ON DELETE CASCADE,
  created_at  timestamp NOT NULL DEFAULT now(),
  CONSTRAINT escolar_espacio_secciones_curso_uq UNIQUE (curso_id)
);
CREATE INDEX IF NOT EXISTS escolar_espacio_secciones_espacio_idx ON escolar_espacio_secciones (team_id, espacio_id);

-- 3. La ficha de activo fijo conoce su espacio, su estado y si es «solo control».
--    · espacio_id: dónde está. La `ubicacion` de texto se queda como nota.
--    · estado: bien | regular | danado.
--    · solo_control: se cuenta en unidades pero NO se deprecia ni genera asientos de
--      depreciación (cosas baratas que van al gasto).
ALTER TABLE contabilidad_activos_fijos
  ADD COLUMN IF NOT EXISTS espacio_id integer REFERENCES escolar_espacios(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS estado varchar(10) NOT NULL DEFAULT 'bien',
  ADD COLUMN IF NOT EXISTS solo_control boolean NOT NULL DEFAULT false;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'contabilidad_activos_fijos_estado_chk') THEN
    ALTER TABLE contabilidad_activos_fijos
      ADD CONSTRAINT contabilidad_activos_fijos_estado_chk CHECK (estado IN ('bien', 'regular', 'danado'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS contabilidad_activos_fijos_espacio_idx
  ON contabilidad_activos_fijos (team_id, espacio_id) WHERE espacio_id IS NOT NULL;

-- 4. Historial de traslados de unidades entre espacios. Si se mueve toda la ficha,
--    `activo_nuevo_id` queda vacío; si se mueve una parte, la ficha se divide en dos
--    y ahí va la nueva. Guarda lo que se llevó la parte movida (costo, residual y
--    depreciación acumulada) para poder explicar el reparto.
CREATE TABLE IF NOT EXISTS escolar_activo_traslados (
  id                  serial PRIMARY KEY,
  team_id             integer NOT NULL REFERENCES teams(id),
  -- La ficha de la que salieron las unidades. Si la ficha se borra, su historia se va con ella.
  activo_id           integer NOT NULL REFERENCES contabilidad_activos_fijos(id) ON DELETE CASCADE,
  activo_nuevo_id     integer REFERENCES contabilidad_activos_fijos(id) ON DELETE SET NULL,
  nombre              varchar(160) NOT NULL,
  espacio_origen_id   integer REFERENCES escolar_espacios(id) ON DELETE SET NULL,
  espacio_destino_id  integer REFERENCES escolar_espacios(id) ON DELETE SET NULL,
  unidades            integer NOT NULL,
  costo_cents         bigint NOT NULL DEFAULT 0,
  residual_cents      bigint NOT NULL DEFAULT 0,
  deprec_cents        bigint NOT NULL DEFAULT 0,
  nota                varchar(300),
  created_by          integer REFERENCES users(id),
  created_at          timestamp NOT NULL DEFAULT now(),
  CONSTRAINT escolar_activo_traslados_unidades_chk CHECK (unidades >= 1)
);
CREATE INDEX IF NOT EXISTS escolar_activo_traslados_team_idx ON escolar_activo_traslados (team_id, created_at DESC);
CREATE INDEX IF NOT EXISTS escolar_activo_traslados_activo_idx ON escolar_activo_traslados (activo_id);
