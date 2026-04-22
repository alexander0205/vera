-- Migración 0016: Campos del representante legal y actividad económica
-- Requeridos para la postulación DGII como Emisor Electrónico.

ALTER TABLE "teams"
  ADD COLUMN IF NOT EXISTS "actividad_economica"   varchar(20),
  ADD COLUMN IF NOT EXISTS "cedula_representante"  varchar(11),
  ADD COLUMN IF NOT EXISTS "nombre_representante"  varchar(255),
  ADD COLUMN IF NOT EXISTS "correo_representante"  varchar(255);
