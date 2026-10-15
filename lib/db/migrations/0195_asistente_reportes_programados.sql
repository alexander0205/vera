-- 0195 · Asistente de Zero: reportes programados por correo.
--
-- Una persona (dueño o administrador) pide recibir cada día, semana o mes un
-- reporte en PDF en SU correo. Un cron diario arma lo que toca y lo envía.
-- Solo a la dirección de quien lo programó: nunca a terceros.
--
-- Aditiva e idempotente.

CREATE TABLE IF NOT EXISTS asistente_reportes_programados (
  id               SERIAL PRIMARY KEY,
  team_id          INTEGER NOT NULL REFERENCES teams(id),
  user_id          INTEGER NOT NULL REFERENCES users(id),
  tipo             VARCHAR(16) NOT NULL,   -- ventas | cobros | clientes | itbis
  frecuencia       VARCHAR(10) NOT NULL,   -- diaria | semanal | mensual
  activo           BOOLEAN NOT NULL DEFAULT TRUE,
  ultimo_envio_en  TIMESTAMP,
  ultimo_error     VARCHAR(200),
  creado_en        TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Una persona no repite el mismo reporte con la misma frecuencia.
CREATE UNIQUE INDEX IF NOT EXISTS asistente_reportes_unico_idx
  ON asistente_reportes_programados (team_id, user_id, tipo, frecuencia);

CREATE INDEX IF NOT EXISTS asistente_reportes_activos_idx
  ON asistente_reportes_programados (activo) WHERE activo;
