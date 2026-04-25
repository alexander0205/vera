-- Migración 0017: Identificador del contribuyente en ECF API
-- Almacena el codigoPublico asignado al registrar la empresa en el proveedor de NCF.
-- Null = empresa aún no registrada en ecf-api.

ALTER TABLE "teams"
  ADD COLUMN IF NOT EXISTS "ecf_codigo_publico" varchar(50);
