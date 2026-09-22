-- 0181 · Fotos de facturas de proveedor por enlace público.
--
-- La empresa comparte UN enlace (WhatsApp, lo que sea) que no vence; quien lo
-- abre toma la foto de la factura y cae en una bandeja «por revisar». Lo que se
-- lee de la foto (QR del e-CF o IA) llena el registro de compras y gastos; nada
-- entra al 606 ni a la contabilidad hasta que alguien con permiso lo registra.
--
-- Aditiva e idempotente: se puede correr dos veces.

CREATE TABLE IF NOT EXISTS captura_facturas_enlaces (
  id             SERIAL PRIMARY KEY,
  team_id        INTEGER NOT NULL REFERENCES teams(id),
  -- Solo el SHA-256 del token: un volcado de la tabla no sirve para subir.
  token_hash     CHAR(64) NOT NULL,
  creado_por     INTEGER REFERENCES users(id),
  creado_en      TIMESTAMP NOT NULL DEFAULT now(),
  ultimo_uso_en  TIMESTAMP,
  revocado_en    TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS captura_facturas_enlaces_token_uq
  ON captura_facturas_enlaces (token_hash);
-- El token cifrado (AES-256-GCM con CERT_MASTER_KEY, `iv:authTag:cifrado`)
-- para volver a enseñar el enlace en la pantalla: se comparte muchas veces.
ALTER TABLE captura_facturas_enlaces ADD COLUMN IF NOT EXISTS token_cifrado TEXT;
-- Uno vivo por empresa: regenerar revoca el anterior.
CREATE UNIQUE INDEX IF NOT EXISTS captura_facturas_enlaces_vivo_uq
  ON captura_facturas_enlaces (team_id) WHERE revocado_en IS NULL;

CREATE TABLE IF NOT EXISTS captura_facturas (
  id             SERIAL PRIMARY KEY,
  team_id        INTEGER NOT NULL REFERENCES teams(id),
  enlace_id      INTEGER REFERENCES captura_facturas_enlaces(id),
  estado         VARCHAR(20) NOT NULL DEFAULT 'procesando',
  subido_por     VARCHAR(120),
  nota           TEXT,
  -- Cómo se leyó: qr (timbre del e-CF), ia, o manual (no se pudo leer).
  metodo         VARCHAR(10),
  datos          JSONB,
  error          TEXT,
  compra_id      INTEGER REFERENCES compras_locales(id),
  creado_en      TIMESTAMP NOT NULL DEFAULT now(),
  procesado_en   TIMESTAMP,
  revisado_por   INTEGER REFERENCES users(id),
  revisado_en    TIMESTAMP
);
DO $$ BEGIN
  ALTER TABLE captura_facturas ADD CONSTRAINT captura_facturas_estado_chk
    CHECK (estado IN ('procesando', 'por_revisar', 'registrada', 'descartada'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE captura_facturas ADD CONSTRAINT captura_facturas_metodo_chk
    CHECK (metodo IS NULL OR metodo IN ('qr', 'ia', 'manual'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS captura_facturas_team_estado_idx
  ON captura_facturas (team_id, estado, creado_en DESC);

CREATE TABLE IF NOT EXISTS captura_facturas_archivos (
  id             SERIAL PRIMARY KEY,
  team_id        INTEGER NOT NULL REFERENCES teams(id),
  captura_id     INTEGER NOT NULL REFERENCES captura_facturas(id) ON DELETE CASCADE,
  orden          SMALLINT NOT NULL DEFAULT 0,
  mime           VARCHAR(100) NOT NULL,
  tamano_bytes   INTEGER NOT NULL,
  sha256         CHAR(64) NOT NULL,
  -- 's3' → el binario está en s3_key; 'db' → en contenido (base64, sin bucket).
  storage        VARCHAR(10) NOT NULL,
  s3_key         TEXT,
  contenido      TEXT,
  creado_en      TIMESTAMP NOT NULL DEFAULT now()
);
DO $$ BEGIN
  ALTER TABLE captura_facturas_archivos ADD CONSTRAINT captura_facturas_archivos_storage_chk
    CHECK (storage IN ('s3', 'db'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS captura_facturas_archivos_captura_idx
  ON captura_facturas_archivos (captura_id, orden);
-- La misma foto enviada dos veces (mala cobertura, doble toque) se reconoce.
CREATE INDEX IF NOT EXISTS captura_facturas_archivos_sha_idx
  ON captura_facturas_archivos (team_id, sha256);
