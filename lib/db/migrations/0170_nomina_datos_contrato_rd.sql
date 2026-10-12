-- Nómina · datos necesarios para el contrato estructurado dominicano.
-- Código de Trabajo, Ley 16-92, art. 24: el contrato escrito identifica al
-- trabajador y consigna servicio, horas/lugar, retribución y modalidad.
-- Aditiva e idempotente: se aplica manualmente en los entornos existentes.
ALTER TABLE empleados ADD COLUMN IF NOT EXISTS estado_civil VARCHAR(30);
ALTER TABLE empleados ADD COLUMN IF NOT EXISTS direccion VARCHAR(255);
ALTER TABLE empleados ADD COLUMN IF NOT EXISTS fecha_fin_contrato DATE;
ALTER TABLE empleados ADD COLUMN IF NOT EXISTS objeto_contrato TEXT;
