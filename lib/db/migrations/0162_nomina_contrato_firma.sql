-- Firma electrónica de contratos (fase 2). El contrato se envía por un enlace
-- público con token de 256 bits; en la base vive solo el SHA-256. El empleado
-- firma en pantalla y se archiva la imagen + un sello de integridad + IP.
--
-- Aditiva: columnas nuevas sobre nomina_contratos, todas nullable.
ALTER TABLE nomina_contratos ADD COLUMN IF NOT EXISTS token_hash      char(64);
ALTER TABLE nomina_contratos ADD COLUMN IF NOT EXISTS enviado_en      timestamp;
ALTER TABLE nomina_contratos ADD COLUMN IF NOT EXISTS firmado_en      timestamp;
ALTER TABLE nomina_contratos ADD COLUMN IF NOT EXISTS firmante_nombre varchar(200);
ALTER TABLE nomina_contratos ADD COLUMN IF NOT EXISTS firma_ref       text;
ALTER TABLE nomina_contratos ADD COLUMN IF NOT EXISTS firma_hash      char(64);
ALTER TABLE nomina_contratos ADD COLUMN IF NOT EXISTS firma_ip        varchar(64);

-- Un token apunta a un solo contrato (los NULL no chocan entre sí en Postgres).
CREATE UNIQUE INDEX IF NOT EXISTS nomina_contratos_token_uniq
  ON nomina_contratos (token_hash);
