-- Migración 0015: Token de enrutamiento DGII por tenant
-- Cada team recibe un UUID único e inmutable que va en la URL pública
-- que el cliente copia al portal de certificación de la DGII.
-- Formato: api.emitedo.com/dgii/v1/{token}/fe/recepcion/api/ecf

ALTER TABLE "teams"
  ADD COLUMN IF NOT EXISTS "dgii_routing_token" uuid DEFAULT gen_random_uuid() UNIQUE;

-- Generar token para teams existentes que aún no tienen uno
UPDATE "teams"
  SET "dgii_routing_token" = gen_random_uuid()
  WHERE "dgii_routing_token" IS NULL;
