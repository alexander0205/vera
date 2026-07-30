-- Anulación de rangos de e-NCF no utilizados ante DGII (ANECF).
-- Un registro por envío: guarda el tramo, el veredicto de DGII y la traza de
-- quién lo mandó. Los números dentro de un tramo ACEPTADO pasan a mostrarse
-- como "Anulado ante DGII" en Contabilidad → Consulta de e-NCF.
CREATE TABLE IF NOT EXISTS "anulaciones_ncf" (
  "id"              serial PRIMARY KEY NOT NULL,
  "team_id"         integer NOT NULL REFERENCES "teams"("id"),
  "tipo_ecf"        varchar(10) NOT NULL,
  "desde"           bigint NOT NULL,
  "hasta"           bigint NOT NULL,
  "cantidad"        integer NOT NULL,
  "estado"          varchar(20) NOT NULL DEFAULT 'PENDIENTE',
  "anulacion_id"    varchar(40),
  "track_id"        varchar(64),
  "respuesta_dgii"  jsonb,
  "motivo"          varchar(500),
  "created_by"      integer REFERENCES "users"("id"),
  "created_at"      timestamp NOT NULL DEFAULT now(),
  "updated_at"      timestamp NOT NULL DEFAULT now()
);

-- Consulta de e-NCF cruza por (team, tipo) y filtra por rango solapado.
CREATE INDEX IF NOT EXISTS "anulncf_team_tipo_idx"
  ON "anulaciones_ncf" ("team_id","tipo_ecf","desde","hasta");
CREATE INDEX IF NOT EXISTS "anulncf_team_estado_idx"
  ON "anulaciones_ncf" ("team_id","estado");
