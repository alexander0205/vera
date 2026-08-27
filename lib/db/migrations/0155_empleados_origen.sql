-- Procedencia del empleado: enlace SUAVE (sin FK) al módulo escolar.
--
-- 'manual' = alta directa en nómina; 'escolar' = importado de "Personal" del
-- colegio. `origen_ref` guarda la clave de la persona escolar origen
-- ('sigerd:<id>' | 'manual:<id>') para dedup y trazabilidad. El puntero vive
-- SOLO en esta tabla (schema unidireccional): escolar no gana columnas de
-- nómina; su pantalla solo lee nómina en runtime si el módulo está activo.
--
-- Aditiva y con defaults: las filas existentes quedan como 'manual' sin ref.
ALTER TABLE empleados ADD COLUMN IF NOT EXISTS origen varchar(20) NOT NULL DEFAULT 'manual';
ALTER TABLE empleados ADD COLUMN IF NOT EXISTS origen_ref varchar(40);
CREATE INDEX IF NOT EXISTS empleados_team_origen_idx ON empleados (team_id, origen);
