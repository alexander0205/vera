-- 0240 · Academia: videos de entrenamiento y estado de las tarjetas de tutorial.
--
-- 1. academia_videos: el catálogo. Cada video pertenece a un módulo y,
--    opcionalmente, a una pantalla (el `id` de lib/config/pantallas.ts, por
--    ejemplo «fact-cxc»): ese enlace es el que enciende la tarjeta de tutorial
--    en esa pantalla. El video NO se aloja aquí: vive en Vimeo (no listado
--    u oculto) y solo se guarda su id y, si es no listado, el hash del enlace
--    (vimeo.com/<id>/<hash>). La miniatura y la duración se leen del oEmbed
--    público de Vimeo al guardar; si falla, las escribe el administrador.
--    `capitulos` y `transcripcion` son jsonb: [{ "t": segundos, "titulo"|"texto": … }].
--    Solo los publicados los ve el público; el borrador lo ve /admin.
--
-- 2. academia_progreso: por persona y video, hasta dónde llegó y si lo terminó.
--
-- 3. academia_tarjetas: por persona y pantalla, si descartó la tarjeta
--    («ahora no» hasta una fecha, «no mostrar más») y en cuántos días se le mostró.
--    El estado vive en la base y no en el navegador, para que siga a la persona
--    de un equipo a otro.
--
-- Tablas NUEVAS y sin tocar `users` ni nada que se lea con `select *` en cada
-- petición. Aditiva e idempotente. El código de antes no las lee; el código
-- nuevo, si no existen, no muestra nada y no se rompe.

CREATE TABLE IF NOT EXISTS academia_videos (
  id               SERIAL PRIMARY KEY,
  slug             VARCHAR(80) NOT NULL UNIQUE,
  titulo           VARCHAR(160) NOT NULL,
  descripcion      TEXT NOT NULL DEFAULT '',
  -- facturacion | pos | escolar | contabilidad | nomina | administracion | general
  modulo           VARCHAR(20) NOT NULL DEFAULT 'general',
  -- id de la pantalla (lib/config/pantallas.ts) a la que enseña; NULL = ninguna en particular.
  pantalla         VARCHAR(60),
  duracion_seg     INTEGER NOT NULL DEFAULT 0,
  -- Id del video de Vimeo (solo dígitos); único: un video, un registro.
  vimeo_id         VARCHAR(20) NOT NULL UNIQUE,
  -- Hash de los no listados (vimeo.com/<id>/<hash>); NULL si el video es público.
  vimeo_hash       VARCHAR(40),
  -- Miniatura (https): la del oEmbed de Vimeo o una escrita a mano; NULL = sin imagen.
  miniatura_url    TEXT,
  publicado        BOOLEAN NOT NULL DEFAULT FALSE,
  orden            INTEGER NOT NULL DEFAULT 0,
  capitulos        JSONB NOT NULL DEFAULT '[]'::jsonb,
  transcripcion    JSONB NOT NULL DEFAULT '[]'::jsonb,
  creado_en        TIMESTAMP NOT NULL DEFAULT NOW(),
  actualizado_en   TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS academia_videos_pantalla_idx ON academia_videos (pantalla) WHERE publicado;
CREATE INDEX IF NOT EXISTS academia_videos_modulo_idx ON academia_videos (modulo, orden) WHERE publicado;

CREATE TABLE IF NOT EXISTS academia_progreso (
  user_id          INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  video_id         INTEGER NOT NULL REFERENCES academia_videos(id) ON DELETE CASCADE,
  avance_seg       INTEGER NOT NULL DEFAULT 0,
  visto            BOOLEAN NOT NULL DEFAULT FALSE,
  actualizado_en   TIMESTAMP NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, video_id)
);

CREATE TABLE IF NOT EXISTS academia_tarjetas (
  user_id          INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  pantalla         VARCHAR(60) NOT NULL,
  -- «Ahora no»: no se muestra hasta esta fecha.
  oculta_hasta     TIMESTAMP,
  -- «No mostrar más».
  nunca            BOOLEAN NOT NULL DEFAULT FALSE,
  -- En cuántos DÍAS distintos salió la tarjeta (a lo más una vez por día).
  veces_mostrada   INTEGER NOT NULL DEFAULT 0,
  -- Última vez que salió en pantalla (para no repetirla el mismo día).
  mostrada_en      TIMESTAMP,
  actualizado_en   TIMESTAMP NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, pantalla)
);
