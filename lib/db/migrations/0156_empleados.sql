-- Nómina · T1 — Maestro de empleados.
-- Tabla nueva del dominio laboral (no toca ningún vertical existente). Es la
-- base sobre la que corren las corridas de nómina en fases siguientes.
-- La cédula se guarda pelada (solo dígitos); el tipo se infiere con
-- lib/documento/identidad.ts. Los campos de banco existen desde ya porque la
-- Fase 4 ("reciben pago") arma el archivo de dispersión bancaria con ellos.
-- Aditivo puro: IF NOT EXISTS porque estas migraciones se corren a mano.
CREATE TABLE IF NOT EXISTS empleados (
  id                  SERIAL PRIMARY KEY,
  team_id             INTEGER NOT NULL REFERENCES teams(id),
  cedula              VARCHAR(20),
  nombres             VARCHAR(160) NOT NULL,
  apellidos           VARCHAR(160) NOT NULL,
  cargo               VARCHAR(120),
  tipo_contrato       VARCHAR(30)  NOT NULL DEFAULT 'indefinido',
  salario_base_cents  BIGINT       NOT NULL DEFAULT 0,
  frecuencia_pago     VARCHAR(20)  NOT NULL DEFAULT 'mensual',
  fecha_ingreso       DATE,
  fecha_salida        DATE,
  estado              VARCHAR(20)  NOT NULL DEFAULT 'activo',
  afp                 VARCHAR(80),
  ars                 VARCHAR(80),
  banco_nombre        VARCHAR(80),
  banco_cuenta        VARCHAR(40),
  banco_tipo_cuenta   VARCHAR(20),
  sexo                VARCHAR(20),
  fecha_nacimiento    DATE,
  nacionalidad        VARCHAR(60),
  telefono            VARCHAR(30),
  email               VARCHAR(160),
  notas               TEXT,
  created_by          INTEGER REFERENCES users(id),
  created_at          TIMESTAMP NOT NULL DEFAULT now(),
  updated_at          TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS empleados_team_idx        ON empleados (team_id);
CREATE INDEX IF NOT EXISTS empleados_team_estado_idx ON empleados (team_id, estado);
