-- Nómina · Registro de empleado (estilo Deel) — datos laborales + documentos.
--
-- El alta de un empleado pasa de un formulario único a un asistente de varios
-- pasos. Este migración agrega las condiciones laborales que el asistente
-- captura (jornada, turno, vacaciones, descanso, país) y una tabla para los
-- documentos que se adjuntan (verificación de antecedentes, etc.).
--
-- Los documentos reaprovechan el andamiaje de comprobantes/archivos escolares:
-- S3 privado con fallback base64 en Postgres (storage='db'), tipo por magic
-- bytes, llave con UUID. Ver lib/administracion-escolar/documentos-archivo.ts.
--
-- Aditiva: columnas nuevas nullable + tabla nueva. Nada existente se toca.
-- IF NOT EXISTS porque estas migraciones se corren a mano.

ALTER TABLE empleados ADD COLUMN IF NOT EXISTS pais            VARCHAR(60);
ALTER TABLE empleados ADD COLUMN IF NOT EXISTS jornada         VARCHAR(20);
ALTER TABLE empleados ADD COLUMN IF NOT EXISTS turno           VARCHAR(20);
ALTER TABLE empleados ADD COLUMN IF NOT EXISTS vacaciones_dias INTEGER;
ALTER TABLE empleados ADD COLUMN IF NOT EXISTS dias_libres     VARCHAR(40);

-- Documentos adjuntos del empleado (antecedentes, cédula escaneada, título…).
-- El binario vive en S3 (storage='s3', s3_key) o, sin credenciales, en base64
-- en la propia fila (storage='db', contenido). El tipo se detecta por magic
-- bytes; la llave lleva un UUID, nunca el id de la fila.
CREATE TABLE IF NOT EXISTS empleado_documentos (
  id             SERIAL PRIMARY KEY,
  team_id        INTEGER NOT NULL REFERENCES teams(id),
  empleado_id    INTEGER NOT NULL REFERENCES empleados(id) ON DELETE CASCADE,
  -- 'antecedentes' | 'cedula' | 'titulo' | 'otro'. Texto libre por ahora.
  tipo           VARCHAR(40) NOT NULL DEFAULT 'antecedentes',
  archivo_nombre VARCHAR(255),
  mime           VARCHAR(100) NOT NULL,
  tamano_bytes   INTEGER NOT NULL,
  sha256         CHAR(64) NOT NULL,
  -- 's3' | 'db'
  storage        VARCHAR(4) NOT NULL,
  s3_key         TEXT,
  contenido      TEXT,
  subido_por     INTEGER REFERENCES users(id),
  created_at     TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS empleado_documentos_empleado_idx
  ON empleado_documentos (empleado_id);
CREATE INDEX IF NOT EXISTS empleado_documentos_team_idx
  ON empleado_documentos (team_id);
-- El mismo binario no se guarda dos veces para el mismo empleado.
CREATE UNIQUE INDEX IF NOT EXISTS empleado_documentos_sha_uniq
  ON empleado_documentos (empleado_id, sha256);
