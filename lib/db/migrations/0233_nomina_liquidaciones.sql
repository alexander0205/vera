-- 0233 · Liquidación de un empleado que sale.
--
-- Una liquidación (preaviso, cesantía, vacaciones no disfrutadas y regalía
-- proporcional) es una corrida de un solo empleado con tipo 'liquidacion'. Se
-- guarda aparte lo que hace falta para entenderla y para deshacerla:
--   · el cálculo (meses, salario diario, componentes con sus días);
--   · cómo estaba el empleado antes (estado y fecha de salida), para restaurarlo
--     si se borra el borrador.
--
-- También: varias liquidaciones pueden caer el mismo día, así que el índice único
-- de (empresa, tipo, fecha de inicio) ya no aplica al tipo 'liquidacion'.
--
-- Requiere 0230 (la liquidación escribe en `nomina_linea_conceptos`).
-- Aditiva e idempotente.

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
-- Un empleado se liquida una sola vez POR SALIDA: si reingresa y vuelve a salir, otra fecha de salida
-- permite otra liquidación (si se borra el borrador, la fila se va con él).
CREATE UNIQUE INDEX IF NOT EXISTS nomina_liquidaciones_empleado_uniq ON nomina_liquidaciones (empleado_id, fecha_salida);
CREATE INDEX IF NOT EXISTS nomina_liquidaciones_team_idx ON nomina_liquidaciones (team_id, fecha_salida);

DROP INDEX IF EXISTS nomina_corridas_inicio_uniq;
CREATE UNIQUE INDEX IF NOT EXISTS nomina_corridas_inicio_uniq
  ON nomina_corridas (team_id, tipo, fecha_inicio)
  WHERE tipo <> 'liquidacion';
