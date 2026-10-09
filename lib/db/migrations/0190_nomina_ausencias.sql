-- 0190 · Faltas y licencias de los empleados.
--
-- La nómina prorrateaba por fechas de ingreso/salida pero no tenía dónde anotar
-- que alguien faltó o estuvo de licencia. Cada ausencia es un rango de fechas;
-- las que no se pagan (falta, licencia sin pago) restan días a la corrida.
--
-- Aditiva e idempotente.

CREATE TABLE IF NOT EXISTS nomina_ausencias (
  id           SERIAL PRIMARY KEY,
  team_id      INTEGER NOT NULL REFERENCES teams(id),
  empleado_id  INTEGER NOT NULL REFERENCES empleados(id) ON DELETE CASCADE,
  tipo         VARCHAR(20) NOT NULL,
  desde        DATE NOT NULL,
  hasta        DATE NOT NULL,
  comentario   VARCHAR(300),
  activo       BOOLEAN NOT NULL DEFAULT TRUE,
  created_by   INTEGER REFERENCES users(id),
  created_at   TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT nomina_ausencias_rango_chk CHECK (hasta >= desde),
  CONSTRAINT nomina_ausencias_tipo_chk CHECK (tipo IN ('falta', 'licencia_sin_pago', 'licencia_con_pago'))
);
CREATE INDEX IF NOT EXISTS nomina_ausencias_team_empleado_idx ON nomina_ausencias (team_id, empleado_id, desde);
CREATE UNIQUE INDEX IF NOT EXISTS nomina_ausencias_activa_uniq
  ON nomina_ausencias (empleado_id, tipo, desde, hasta) WHERE activo;
