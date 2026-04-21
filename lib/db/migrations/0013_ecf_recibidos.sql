-- ─────────────────────────────────────────────────────────────────────────────
-- Migración 0013: Tabla `ecf_documents_recibidos` para e-CFs que otras empresas
-- nos envían (tipos 31, 33, 34, 44 entre contribuyentes).
--
-- Para aplicar:
--   psql $POSTGRES_URL -f lib/db/migrations/0013_ecf_recibidos.sql
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS ecf_documents_recibidos (
  id                      SERIAL PRIMARY KEY,
  team_id                 INTEGER NOT NULL REFERENCES teams(id),

  encf                    VARCHAR(40) NOT NULL,
  tipo_ecf                VARCHAR(2)  NOT NULL,

  rnc_emisor              VARCHAR(20) NOT NULL,
  razon_social_emisor     VARCHAR(255),
  rnc_receptor            VARCHAR(20) NOT NULL,

  monto_total             INTEGER NOT NULL DEFAULT 0,
  total_itbis             INTEGER NOT NULL DEFAULT 0,

  xml_recibido            TEXT NOT NULL,
  arecf_firmado           TEXT,

  estado_acuse            VARCHAR(20) NOT NULL DEFAULT 'RECIBIDO',
  codigo_rechazo          VARCHAR(2),

  estado_comercial        VARCHAR(20) NOT NULL DEFAULT 'PENDIENTE',
  acecf_recibido          TEXT,
  fecha_estado_comercial  TIMESTAMP,

  fecha_recepcion         TIMESTAMP NOT NULL DEFAULT NOW(),
  created_at              TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ecf_recibidos_team_idx
  ON ecf_documents_recibidos(team_id);

CREATE INDEX IF NOT EXISTS ecf_recibidos_encf_idx
  ON ecf_documents_recibidos(team_id, rnc_emisor, encf);
