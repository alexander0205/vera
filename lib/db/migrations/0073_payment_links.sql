-- Pasarelas de pago: credenciales por empresa + links de pago (CardNet/Azul)
CREATE TABLE IF NOT EXISTS "payment_provider_config" (
  "id"          serial PRIMARY KEY NOT NULL,
  "team_id"     integer NOT NULL REFERENCES "teams"("id"),
  "provider"    varchar(20) NOT NULL,
  "merchant_id" varchar(50),
  "terminal_id" varchar(50),
  "auth_key"    jsonb,
  "api_key"     jsonb,
  "ambiente"    varchar(10) NOT NULL DEFAULT 'sandbox',
  "enabled"     boolean NOT NULL DEFAULT false,
  "created_at"  timestamp NOT NULL DEFAULT now(),
  "updated_at"  timestamp NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "ppc_team_provider_uq"
  ON "payment_provider_config" ("team_id","provider");

CREATE TABLE IF NOT EXISTS "payment_links" (
  "id"               serial PRIMARY KEY NOT NULL,
  "token"            varchar(40) NOT NULL UNIQUE,
  "team_id"          integer NOT NULL REFERENCES "teams"("id"),
  "provider"         varchar(20) NOT NULL,
  "ecf_document_id"  integer REFERENCES "ecf_documents"("id"),
  "cotizacion_id"    integer REFERENCES "cotizaciones"("id"),
  "monto_centavos"   integer NOT NULL,
  "itbis_centavos"   integer NOT NULL DEFAULT 0,
  "currency"         varchar(3) NOT NULL DEFAULT 'DOP',
  "orden_id"         varchar(50) NOT NULL,
  "estado"           varchar(20) NOT NULL DEFAULT 'pendiente',
  "session_id"       varchar(64),
  "session_key"      varchar(128),
  "provider_ref"     varchar(64),
  "card_mask"        varchar(25),
  "pago_recibido_id" integer REFERENCES "pagos_recibidos"("id"),
  "expires_at"       timestamp,
  "paid_at"          timestamp,
  "created_by"       integer REFERENCES "users"("id"),
  "created_at"       timestamp NOT NULL DEFAULT now(),
  "updated_at"       timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "paylink_team_estado_idx" ON "payment_links" ("team_id","estado");
CREATE INDEX IF NOT EXISTS "paylink_ecf_idx"   ON "payment_links" ("ecf_document_id");
CREATE INDEX IF NOT EXISTS "paylink_cotiz_idx" ON "payment_links" ("cotizacion_id");
CREATE UNIQUE INDEX IF NOT EXISTS "paylink_orden_uq" ON "payment_links" ("team_id","orden_id");
