-- Nómina · Plantilla de contrato ESTRUCTURADA (estilo Deel).
--
-- La plantilla deja de ser texto libre con {{marcadores}} y pasa a ser una
-- CONFIGURACIÓN por pasos: qué cláusulas incluir y sus parámetros. Al generar el
-- contrato de un empleado, el sistema ENSAMBLA el texto legal RD a partir de esa
-- config + los datos del empleado (ver lib/nomina/contrato-estructura.ts).
--
-- `config` guarda esa estructura (jsonb). `cuerpo` pasa a nullable: las
-- plantillas estructuradas no tienen prosa. Las plantillas viejas (solo cuerpo)
-- siguen funcionando por compatibilidad.
--
-- Aditiva salvo el DROP NOT NULL (compatible: las filas viejas ya tienen cuerpo).
ALTER TABLE nomina_contrato_plantillas ALTER COLUMN cuerpo DROP NOT NULL;
ALTER TABLE nomina_contrato_plantillas ADD COLUMN IF NOT EXISTS config jsonb;
