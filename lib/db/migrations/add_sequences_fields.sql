-- Migración: ampliar tabla sequences para soporte NCF completo
-- Ejecutar con: psql $DATABASE_URL -f lib/db/migrations/add_sequences_fields.sql

-- 1. Ampliar tipo_ecf para soportar 'sin-ncf' (era varchar(2))
ALTER TABLE sequences ALTER COLUMN tipo_ecf TYPE varchar(10);

-- 2. Agregar nuevas columnas
ALTER TABLE sequences ADD COLUMN IF NOT EXISTS nombre varchar(200);
ALTER TABLE sequences ADD COLUMN IF NOT EXISTS secuencia_desde bigint NOT NULL DEFAULT 1;
ALTER TABLE sequences ADD COLUMN IF NOT EXISTS preferida boolean NOT NULL DEFAULT false;
ALTER TABLE sequences ADD COLUMN IF NOT EXISTS numeracion_automatica boolean NOT NULL DEFAULT true;
ALTER TABLE sequences ADD COLUMN IF NOT EXISTS prefijo varchar(20);
ALTER TABLE sequences ADD COLUMN IF NOT EXISTS pie_de_factura text;
ALTER TABLE sequences ADD COLUMN IF NOT EXISTS sucursal varchar(100);

-- 3. fecha_vencimiento ya no es obligatoria (para Sin NCF y e32/e34)
ALTER TABLE sequences ALTER COLUMN fecha_vencimiento DROP NOT NULL;

-- 4. Eliminar unique constraint para permitir múltiples secuencias por tipo
ALTER TABLE sequences DROP CONSTRAINT IF EXISTS sequences_team_tipo_unique;

-- 5. Índices de rendimiento
CREATE INDEX IF NOT EXISTS sequences_team_tipo_idx ON sequences(team_id, tipo_ecf);
CREATE INDEX IF NOT EXISTS sequences_team_preferida_idx ON sequences(team_id, preferida);
