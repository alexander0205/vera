-- Nómina · Contrato firmado SUBIDO (camino offline).
--
-- Además de generar el contrato desde una plantilla y firmarlo en línea, la
-- empresa puede subir un contrato propio YA FIRMADO (impreso, firmado a mano y
-- escaneado). Ese contrato reemplaza al generado y no pide firma: nace directo
-- en estado 'firmado' con `origen='subido'` y el binario archivado.
--
-- El binario reaprovecha el andamiaje de comprobantes/archivos (S3 privado o
-- fallback base64 en la propia fila). Se guarda EN la fila del contrato (no en
-- una tabla aparte) porque es 1:1 con el contrato y se sirve por su misma ruta.
--
-- `cuerpo` deja de ser NOT NULL: un contrato subido no tiene texto plantilla.
--
-- Aditiva salvo el DROP NOT NULL (compatible: las filas viejas ya tienen cuerpo).
ALTER TABLE nomina_contratos ALTER COLUMN cuerpo DROP NOT NULL;

ALTER TABLE nomina_contratos ADD COLUMN IF NOT EXISTS origen VARCHAR(20) NOT NULL DEFAULT 'plataforma';
ALTER TABLE nomina_contratos ADD COLUMN IF NOT EXISTS archivo_nombre       VARCHAR(255);
ALTER TABLE nomina_contratos ADD COLUMN IF NOT EXISTS archivo_mime         VARCHAR(100);
ALTER TABLE nomina_contratos ADD COLUMN IF NOT EXISTS archivo_tamano_bytes INTEGER;
ALTER TABLE nomina_contratos ADD COLUMN IF NOT EXISTS archivo_sha256       CHAR(64);
-- 's3' | 'db'
ALTER TABLE nomina_contratos ADD COLUMN IF NOT EXISTS archivo_storage      VARCHAR(4);
ALTER TABLE nomina_contratos ADD COLUMN IF NOT EXISTS archivo_s3_key       TEXT;
ALTER TABLE nomina_contratos ADD COLUMN IF NOT EXISTS archivo_contenido    TEXT;
