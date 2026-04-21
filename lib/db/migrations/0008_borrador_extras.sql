-- Campos necesarios para poder recargar y editar borradores
ALTER TABLE ecf_documents ADD COLUMN IF NOT EXISTS lineas_json      text;
ALTER TABLE ecf_documents ADD COLUMN IF NOT EXISTS tipo_pago        integer DEFAULT 1;
ALTER TABLE ecf_documents ADD COLUMN IF NOT EXISTS fecha_limite_pago varchar(10);
