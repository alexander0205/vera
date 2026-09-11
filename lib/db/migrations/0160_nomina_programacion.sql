-- Programación automática de nómina: config POR EMPRESA de los días de pago.
--
-- Un cron diario (app/api/cron/nomina-corridas) mira esta fila y, si hoy es un
-- día de pago, crea la corrida de esa frecuencia EN BORRADOR. La idempotencia
-- la da el índice único (team, periodo, tipo) de nomina_corridas, así que aquí
-- no hace falta un puntero de "próxima fecha": solo los días configurados.
--
-- Aditiva: tabla nueva, sin tocar nada existente.
CREATE TABLE IF NOT EXISTS nomina_programacion (
  id                serial PRIMARY KEY,
  team_id           integer NOT NULL REFERENCES teams(id),
  activa            boolean NOT NULL DEFAULT false,
  mensual_activa    boolean NOT NULL DEFAULT true,
  mensual_dia       integer NOT NULL DEFAULT 30,
  quincenal_activa  boolean NOT NULL DEFAULT false,
  quincenal_dia1    integer NOT NULL DEFAULT 15,
  quincenal_dia2    integer NOT NULL DEFAULT 30,
  created_at        timestamp NOT NULL DEFAULT now(),
  updated_at        timestamp NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS nomina_programacion_team_uniq
  ON nomina_programacion (team_id);
