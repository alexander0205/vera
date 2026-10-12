-- Contratos de empleado: plantillas pregrabadas + contratos emitidos (estilo
-- Deel). La plantilla lleva marcadores {{clave}}; al generar el contrato de un
-- empleado se autollenan con sus datos y se archiva el texto ya resuelto. La
-- firma electrónica es fase 2 (columna `estado` deja lugar).
--
-- Aditiva: dos tablas nuevas, nada existente se toca.
CREATE TABLE IF NOT EXISTS nomina_contrato_plantillas (
  id         serial PRIMARY KEY,
  team_id    integer NOT NULL REFERENCES teams(id),
  nombre     varchar(160) NOT NULL,
  cuerpo     text NOT NULL,
  activa     boolean NOT NULL DEFAULT true,
  created_by integer REFERENCES users(id),
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS nomina_contrato_plantillas_team_idx
  ON nomina_contrato_plantillas (team_id);

CREATE TABLE IF NOT EXISTS nomina_contratos (
  id           serial PRIMARY KEY,
  team_id      integer NOT NULL REFERENCES teams(id),
  empleado_id  integer NOT NULL REFERENCES empleados(id),
  plantilla_id integer REFERENCES nomina_contrato_plantillas(id) ON DELETE SET NULL,
  titulo       varchar(200) NOT NULL,
  cuerpo       text NOT NULL,
  estado       varchar(20) NOT NULL DEFAULT 'generado',
  created_by   integer REFERENCES users(id),
  created_at   timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS nomina_contratos_empleado_idx
  ON nomina_contratos (empleado_id);
CREATE INDEX IF NOT EXISTS nomina_contratos_team_idx
  ON nomina_contratos (team_id);
