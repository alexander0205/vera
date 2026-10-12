-- 0185 · Ingresos y descuentos variables por empleado (incentivos, préstamos…).
--
-- Antes la nómina solo pagaba el salario base: `otras_deducciones_cents` existía
-- en cada línea pero nada lo llenaba. Aquí nacen el catálogo de conceptos de la
-- empresa, lo asignado a cada empleado, sus préstamos con saldo y el snapshot de
-- lo aplicado en cada línea de corrida.
--
-- Aditiva e idempotente: se puede correr dos veces.

CREATE TABLE IF NOT EXISTS nomina_conceptos (
  id          SERIAL PRIMARY KEY,
  team_id     INTEGER NOT NULL REFERENCES teams(id),
  codigo      VARCHAR(40)  NOT NULL,
  nombre      VARCHAR(120) NOT NULL,
  tipo        VARCHAR(12)  NOT NULL,
  cotiza_tss  BOOLEAN NOT NULL DEFAULT FALSE,
  cuenta_id   INTEGER REFERENCES contabilidad_cuentas(id),
  activo      BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS nomina_conceptos_team_codigo_uniq ON nomina_conceptos (team_id, codigo);

CREATE TABLE IF NOT EXISTS empleado_conceptos (
  id           SERIAL PRIMARY KEY,
  team_id      INTEGER NOT NULL REFERENCES teams(id),
  empleado_id  INTEGER NOT NULL REFERENCES empleados(id) ON DELETE CASCADE,
  concepto_id  INTEGER NOT NULL REFERENCES nomina_conceptos(id),
  monto_cents  BIGINT  NOT NULL,
  fijo         BOOLEAN NOT NULL DEFAULT FALSE,
  desde        DATE    NOT NULL,
  hasta        DATE,
  comentario   VARCHAR(300),
  activo       BOOLEAN NOT NULL DEFAULT TRUE,
  created_by   INTEGER REFERENCES users(id),
  created_at   TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS empleado_conceptos_team_empleado_idx ON empleado_conceptos (team_id, empleado_id);
-- Un doble clic o dos pestañas no duplican un incentivo: lo idéntico y activo es único.
CREATE UNIQUE INDEX IF NOT EXISTS empleado_conceptos_activo_uniq
  ON empleado_conceptos (empleado_id, concepto_id, monto_cents, fijo, desde, coalesce(hasta, '9999-12-31'::date))
  WHERE activo;

CREATE TABLE IF NOT EXISTS empleado_prestamos (
  id           SERIAL PRIMARY KEY,
  team_id      INTEGER NOT NULL REFERENCES teams(id),
  empleado_id  INTEGER NOT NULL REFERENCES empleados(id) ON DELETE CASCADE,
  monto_cents  BIGINT NOT NULL,
  cuota_cents  BIGINT NOT NULL,
  saldo_cents  BIGINT NOT NULL,
  desde        DATE   NOT NULL,
  estado       VARCHAR(12) NOT NULL DEFAULT 'activo',
  comentario   VARCHAR(300),
  created_by   INTEGER REFERENCES users(id),
  created_at   TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS empleado_prestamos_team_empleado_idx ON empleado_prestamos (team_id, empleado_id, estado);
-- Mismo candado para préstamos recién registrados (aún sin cuotas descontadas).
CREATE UNIQUE INDEX IF NOT EXISTS empleado_prestamos_activo_uniq
  ON empleado_prestamos (empleado_id, monto_cents, cuota_cents, desde)
  WHERE estado = 'activo' AND saldo_cents = monto_cents;

CREATE TABLE IF NOT EXISTS nomina_linea_conceptos (
  id           SERIAL PRIMARY KEY,
  linea_id     INTEGER NOT NULL REFERENCES nomina_lineas(id) ON DELETE CASCADE,
  corrida_id   INTEGER NOT NULL REFERENCES nomina_corridas(id) ON DELETE CASCADE,
  team_id      INTEGER NOT NULL REFERENCES teams(id),
  empleado_id  INTEGER NOT NULL REFERENCES empleados(id),
  concepto_id  INTEGER REFERENCES nomina_conceptos(id),
  prestamo_id  INTEGER REFERENCES empleado_prestamos(id),
  tipo         VARCHAR(12)  NOT NULL,
  nombre       VARCHAR(120) NOT NULL,
  monto_cents  BIGINT NOT NULL,
  pedido_cents BIGINT NOT NULL,
  cotiza_tss   BOOLEAN NOT NULL DEFAULT FALSE,
  cuenta_id    INTEGER REFERENCES contabilidad_cuentas(id),
  comentario   VARCHAR(300)
);
CREATE INDEX IF NOT EXISTS nomina_linea_conceptos_linea_idx   ON nomina_linea_conceptos (linea_id);
CREATE INDEX IF NOT EXISTS nomina_linea_conceptos_corrida_idx ON nomina_linea_conceptos (corrida_id);
