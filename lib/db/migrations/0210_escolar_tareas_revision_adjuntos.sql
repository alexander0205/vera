-- 0210 · Tareas: estado «En revisión» y archivos adjuntos.
--
-- 1. Una tarea puede quedar «en_revision»: alguien ya la tomó o está esperando
--    que la confirmen, pero todavía no está hecha. Sigue contando como
--    pendiente (campana, «Asignadas a mí»).
-- 2. Fotos, videos y documentos en la conversación. El archivo vive en S3
--    (`<prefijo>/tareas/team_N/<uuid>.<ext>`); aquí queda quién lo subió, cómo
--    se llama y el estado de la subida, que llega por trozos (ver
--    lib/storage/tareas.ts). En la conversación sale como un mensaje de tipo
--    «adjunto» que apunta a su fila.
--
-- Solo agrega: el código de antes nunca escribe «en_revision» ni «adjunto», así
-- que se puede correr antes del deploy. Idempotente.

ALTER TABLE admin_escolar_tareas DROP CONSTRAINT IF EXISTS admin_escolar_tareas_estado_check;
ALTER TABLE admin_escolar_tareas ADD CONSTRAINT admin_escolar_tareas_estado_check
  CHECK (estado IN ('abierta', 'en_revision', 'completada'));

CREATE TABLE IF NOT EXISTS admin_escolar_tarea_adjuntos (
  id          serial PRIMARY KEY,
  team_id     integer      NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  tarea_id    integer      NOT NULL REFERENCES admin_escolar_tareas(id) ON DELETE CASCADE,
  user_id     integer      REFERENCES users(id) ON DELETE SET NULL,
  nombre      varchar(200) NOT NULL,
  mime        varchar(120) NOT NULL,
  bytes       integer      NOT NULL,
  s3_key      varchar(300) NOT NULL,
  -- La subida por trozos: el multipart de S3 (si el archivo pasa de un trozo),
  -- las partes ya subidas, cuántos trozos llegaron y si hay uno esperando a su
  -- pareja (S3 no acepta partes de menos de 5 MB salvo la última).
  upload_id   varchar(300),
  partes      jsonb        NOT NULL DEFAULT '[]'::jsonb,
  trozos      integer      NOT NULL DEFAULT 0,
  pendiente   boolean      NOT NULL DEFAULT false,
  subido      boolean      NOT NULL DEFAULT false,
  creado_en   timestamp    NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS admin_escolar_tarea_adjuntos_tarea_idx ON admin_escolar_tarea_adjuntos (tarea_id);

ALTER TABLE admin_escolar_tarea_mensajes ADD COLUMN IF NOT EXISTS adjunto_id integer
  REFERENCES admin_escolar_tarea_adjuntos(id) ON DELETE SET NULL;
ALTER TABLE admin_escolar_tarea_mensajes DROP CONSTRAINT IF EXISTS admin_escolar_tarea_mensajes_tipo_check;
ALTER TABLE admin_escolar_tarea_mensajes ADD CONSTRAINT admin_escolar_tarea_mensajes_tipo_check
  CHECK (tipo IN ('mensaje', 'evento', 'ia', 'adjunto'));
