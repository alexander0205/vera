-- Módulo Administración Escolar — tablas base + matrículas + cargos + pagos.
-- Espejo de lib/db/schema.ts (adminEscolar*). Deuda escolar vive en
-- admin_escolar_cargos (NO depende de facturas). Montos en centavos.
-- Idempotente: IF NOT EXISTS en tablas e índices.

-- ── Períodos escolares ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS admin_escolar_periodos (
  id           SERIAL PRIMARY KEY,
  team_id      INTEGER NOT NULL REFERENCES teams(id),
  nombre       VARCHAR(60) NOT NULL,
  fecha_inicio DATE,
  fecha_fin    DATE,
  activo       BOOLEAN NOT NULL DEFAULT true,
  created_at   TIMESTAMP NOT NULL DEFAULT now(),
  updated_at   TIMESTAMP NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS admin_escolar_periodos_team_idx ON admin_escolar_periodos(team_id);

-- ── Cursos / grados ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS admin_escolar_cursos (
  id         SERIAL PRIMARY KEY,
  team_id    INTEGER NOT NULL REFERENCES teams(id),
  nombre     VARCHAR(80) NOT NULL,
  nivel      VARCHAR(60),
  orden      INTEGER NOT NULL DEFAULT 0,
  activo     BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  updated_at TIMESTAMP NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS admin_escolar_cursos_team_idx ON admin_escolar_cursos(team_id);

-- ── Materias ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS admin_escolar_materias (
  id         SERIAL PRIMARY KEY,
  team_id    INTEGER NOT NULL REFERENCES teams(id),
  nombre     VARCHAR(120) NOT NULL,
  activo     BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  updated_at TIMESTAMP NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS admin_escolar_materias_team_idx ON admin_escolar_materias(team_id);

-- ── Estudiantes ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS admin_escolar_estudiantes (
  id               SERIAL PRIMARY KEY,
  team_id          INTEGER NOT NULL REFERENCES teams(id),
  codigo           VARCHAR(30),
  nombres          VARCHAR(120) NOT NULL,
  apellidos        VARCHAR(120) NOT NULL,
  fecha_nacimiento DATE,
  estado           VARCHAR(20) NOT NULL DEFAULT 'activo',
  dependiente_id   INTEGER REFERENCES dependientes(id),
  created_at       TIMESTAMP NOT NULL DEFAULT now(),
  updated_at       TIMESTAMP NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS admin_escolar_estudiantes_team_idx ON admin_escolar_estudiantes(team_id);

-- ── Tutores ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS admin_escolar_tutores (
  id         SERIAL PRIMARY KEY,
  team_id    INTEGER NOT NULL REFERENCES teams(id),
  client_id  INTEGER REFERENCES clients(id),
  nombre     VARCHAR(160) NOT NULL,
  documento  VARCHAR(30),
  telefono   VARCHAR(30),
  email      VARCHAR(160),
  direccion  VARCHAR(300),
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  updated_at TIMESTAMP NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS admin_escolar_tutores_team_idx ON admin_escolar_tutores(team_id);

-- ── Estudiante ↔ Tutor (N:M) ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS admin_escolar_estudiante_tutores (
  id               SERIAL PRIMARY KEY,
  team_id          INTEGER NOT NULL REFERENCES teams(id),
  estudiante_id    INTEGER NOT NULL REFERENCES admin_escolar_estudiantes(id) ON DELETE CASCADE,
  tutor_id         INTEGER NOT NULL REFERENCES admin_escolar_tutores(id) ON DELETE CASCADE,
  relacion         VARCHAR(20) NOT NULL DEFAULT 'tutor',
  responsable_pago BOOLEAN NOT NULL DEFAULT false,
  created_at       TIMESTAMP NOT NULL DEFAULT now(),
  updated_at       TIMESTAMP NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS admin_escolar_est_tutor_uniq ON admin_escolar_estudiante_tutores(estudiante_id, tutor_id);
CREATE INDEX IF NOT EXISTS admin_escolar_est_tutor_team_idx ON admin_escolar_estudiante_tutores(team_id);

-- ── Matrículas ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS admin_escolar_matriculas (
  id                SERIAL PRIMARY KEY,
  team_id           INTEGER NOT NULL REFERENCES teams(id),
  estudiante_id     INTEGER NOT NULL REFERENCES admin_escolar_estudiantes(id),
  periodo_id        INTEGER NOT NULL REFERENCES admin_escolar_periodos(id),
  curso_id          INTEGER NOT NULL REFERENCES admin_escolar_cursos(id),
  codigo_matricula  VARCHAR(40),
  fecha_inscripcion DATE,
  estado            VARCHAR(20) NOT NULL DEFAULT 'activa',
  notas             TEXT,
  created_at        TIMESTAMP NOT NULL DEFAULT now(),
  updated_at        TIMESTAMP NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS admin_escolar_matriculas_team_idx ON admin_escolar_matriculas(team_id);
CREATE INDEX IF NOT EXISTS admin_escolar_matriculas_estudiante_idx ON admin_escolar_matriculas(estudiante_id);
CREATE INDEX IF NOT EXISTS admin_escolar_matriculas_periodo_idx ON admin_escolar_matriculas(periodo_id);
-- Solo una matrícula 'activa' por (estudiante, período).
CREATE UNIQUE INDEX IF NOT EXISTS admin_escolar_matriculas_activa_uniq
  ON admin_escolar_matriculas(estudiante_id, periodo_id)
  WHERE estado = 'activa';

-- ── Conceptos de pago ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS admin_escolar_conceptos_pago (
  id         SERIAL PRIMARY KEY,
  team_id    INTEGER NOT NULL REFERENCES teams(id),
  nombre     VARCHAR(80) NOT NULL,
  tipo       VARCHAR(20) NOT NULL DEFAULT 'otro',
  recurrente BOOLEAN NOT NULL DEFAULT false,
  activo     BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  updated_at TIMESTAMP NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS admin_escolar_conceptos_team_idx ON admin_escolar_conceptos_pago(team_id);

-- ── Cargos / deudas ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS admin_escolar_cargos (
  id                SERIAL PRIMARY KEY,
  team_id           INTEGER NOT NULL REFERENCES teams(id),
  estudiante_id     INTEGER NOT NULL REFERENCES admin_escolar_estudiantes(id),
  matricula_id      INTEGER NOT NULL REFERENCES admin_escolar_matriculas(id),
  periodo_id        INTEGER NOT NULL REFERENCES admin_escolar_periodos(id),
  concepto_id       INTEGER NOT NULL REFERENCES admin_escolar_conceptos_pago(id),
  mes               SMALLINT,
  anio              SMALLINT NOT NULL,
  monto_centavos    INTEGER NOT NULL,
  saldo_centavos    INTEGER NOT NULL,
  fecha_vencimiento DATE,
  estado            VARCHAR(20) NOT NULL DEFAULT 'pendiente',
  created_at        TIMESTAMP NOT NULL DEFAULT now(),
  updated_at        TIMESTAMP NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS admin_escolar_cargos_team_idx ON admin_escolar_cargos(team_id);
CREATE INDEX IF NOT EXISTS admin_escolar_cargos_estudiante_idx ON admin_escolar_cargos(estudiante_id);
CREATE INDEX IF NOT EXISTS admin_escolar_cargos_matricula_idx ON admin_escolar_cargos(matricula_id);
-- Anti-duplicado: un cargo por estudiante+concepto+período+mes (mes null → 0).
CREATE UNIQUE INDEX IF NOT EXISTS admin_escolar_cargos_uniq
  ON admin_escolar_cargos(estudiante_id, concepto_id, periodo_id, COALESCE(mes, 0));

-- ── Pagos escolares ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS admin_escolar_pagos (
  id                SERIAL PRIMARY KEY,
  team_id           INTEGER NOT NULL REFERENCES teams(id),
  estudiante_id     INTEGER NOT NULL REFERENCES admin_escolar_estudiantes(id),
  matricula_id      INTEGER REFERENCES admin_escolar_matriculas(id),
  cargo_id          INTEGER REFERENCES admin_escolar_cargos(id),
  ecf_document_id   INTEGER REFERENCES ecf_documents(id),
  pago_recibido_id  INTEGER REFERENCES pagos_recibidos(id),
  monto_centavos    INTEGER NOT NULL,
  fecha_pago        DATE NOT NULL,
  metodo            VARCHAR(30),
  referencia        VARCHAR(100),
  notas             TEXT,
  created_by        INTEGER REFERENCES users(id),
  created_at        TIMESTAMP NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS admin_escolar_pagos_team_idx ON admin_escolar_pagos(team_id);
CREATE INDEX IF NOT EXISTS admin_escolar_pagos_estudiante_idx ON admin_escolar_pagos(estudiante_id);
CREATE INDEX IF NOT EXISTS admin_escolar_pagos_cargo_idx ON admin_escolar_pagos(cargo_id);
