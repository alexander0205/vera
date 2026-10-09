-- Nómina · pago por horas.
--
-- Quien cobra por hora tiene una tarifa y sube sus horas por un enlace propio
-- (sin cuenta en Zero, como el enlace de firma). La empresa las aprueba o las
-- rechaza, y la corrida paga solo las aprobadas de sus fechas, con las horas
-- extra (35 % de 44 a 68 a la semana, 100 % desde 68), el recargo nocturno (15 %)
-- y el día feriado (100 %). La línea guarda cómo se clasificaron.
--
-- Aditiva e idempotente: se corre a mano con psql.

ALTER TABLE empleados ADD COLUMN IF NOT EXISTS tarifa_hora_cents   BIGINT;
ALTER TABLE empleados ADD COLUMN IF NOT EXISTS horas_token_hash    VARCHAR(64);
ALTER TABLE empleados ADD COLUMN IF NOT EXISTS horas_token_creado  TIMESTAMP;
CREATE UNIQUE INDEX IF NOT EXISTS empleados_horas_token_uniq ON empleados (horas_token_hash) WHERE horas_token_hash IS NOT NULL;

CREATE TABLE IF NOT EXISTS nomina_horas (
  id              SERIAL PRIMARY KEY,
  team_id         INTEGER NOT NULL REFERENCES teams(id),
  empleado_id     INTEGER NOT NULL REFERENCES empleados(id) ON DELETE CASCADE,
  fecha           DATE NOT NULL,
  horas           NUMERIC(5, 2) NOT NULL,
  horas_nocturnas NUMERIC(5, 2) NOT NULL DEFAULT 0,
  feriado         BOOLEAN NOT NULL DEFAULT false,
  nota            VARCHAR(300),
  estado          VARCHAR(12) NOT NULL DEFAULT 'pendiente',
  origen          VARCHAR(10) NOT NULL DEFAULT 'empleado',
  motivo_rechazo  VARCHAR(300),
  revisado_por    INTEGER REFERENCES users(id),
  revisado_en     TIMESTAMP,
  created_at      TIMESTAMP NOT NULL DEFAULT now(),
  updated_at      TIMESTAMP NOT NULL DEFAULT now(),
  CONSTRAINT nomina_horas_horas_chk     CHECK (horas > 0 AND horas <= 24),
  CONSTRAINT nomina_horas_nocturnas_chk CHECK (horas_nocturnas >= 0 AND horas_nocturnas <= horas),
  CONSTRAINT nomina_horas_estado_chk    CHECK (estado IN ('pendiente', 'aprobada', 'rechazada')),
  CONSTRAINT nomina_horas_origen_chk    CHECK (origen IN ('empleado', 'empresa'))
);
CREATE UNIQUE INDEX IF NOT EXISTS nomina_horas_empleado_fecha_uniq ON nomina_horas (empleado_id, fecha);
CREATE INDEX IF NOT EXISTS nomina_horas_team_estado_idx ON nomina_horas (team_id, estado, fecha);

ALTER TABLE nomina_lineas ADD COLUMN IF NOT EXISTS horas_detalle JSONB;
