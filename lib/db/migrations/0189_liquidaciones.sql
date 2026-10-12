-- 0189 · Liquidación de un empleado que sale.
--
-- Una liquidación (preaviso, cesantía, vacaciones no disfrutadas y regalía
-- proporcional) es una corrida de un solo empleado con tipo 'liquidacion'. Se
-- guarda aparte lo que hace falta para entenderla y para deshacerla:
--   · el cálculo (meses, salario diario, componentes con sus días);
--   · cómo estaba el empleado antes (estado y fecha de salida), para restaurarlo
--     si se borra el borrador.
--
-- También:
--   · `nomina_linea_conceptos.reserva_cuenta_id`: el pasivo de provisión (vacaciones,
--     regalía, cesantía por pagar) contra el que un ingreso se paga primero, hasta
--     donde alcance la reserva acumulada; el resto va al gasto.
--   · Varias liquidaciones pueden caer el mismo día: el índice único de
--     (empresa, tipo, fecha de inicio) ya no aplica al tipo 'liquidacion'.
--
-- Aditiva e idempotente: se puede correr dos veces.

CREATE TABLE IF NOT EXISTS nomina_liquidaciones (
  id                    SERIAL PRIMARY KEY,
  team_id               INTEGER NOT NULL REFERENCES teams(id),
  empleado_id           INTEGER NOT NULL REFERENCES empleados(id),
  corrida_id            INTEGER NOT NULL REFERENCES nomina_corridas(id) ON DELETE CASCADE,
  fecha_ingreso         DATE NOT NULL,
  fecha_salida          DATE NOT NULL,
  motivo                VARCHAR(30) NOT NULL,
  meses_servicio        INTEGER NOT NULL,
  salario_mensual_cents BIGINT NOT NULL,
  salario_diario_cents  BIGINT NOT NULL,
  total_cents           BIGINT NOT NULL,
  componentes           JSONB NOT NULL,
  estado_previo         VARCHAR(20) NOT NULL,
  fecha_salida_previa   DATE,
  created_by            INTEGER REFERENCES users(id),
  created_at            TIMESTAMP NOT NULL DEFAULT NOW()
);
-- Un empleado se liquida una sola vez (si se borra el borrador, la fila se va con él).
CREATE UNIQUE INDEX IF NOT EXISTS nomina_liquidaciones_empleado_uniq ON nomina_liquidaciones (empleado_id);
CREATE INDEX IF NOT EXISTS nomina_liquidaciones_team_idx ON nomina_liquidaciones (team_id, fecha_salida);

ALTER TABLE nomina_linea_conceptos
  ADD COLUMN IF NOT EXISTS reserva_cuenta_id INTEGER REFERENCES contabilidad_cuentas(id);

DROP INDEX IF EXISTS nomina_corridas_inicio_uniq;
CREATE UNIQUE INDEX IF NOT EXISTS nomina_corridas_inicio_uniq
  ON nomina_corridas (team_id, tipo, fecha_inicio)
  WHERE tipo <> 'liquidacion';
