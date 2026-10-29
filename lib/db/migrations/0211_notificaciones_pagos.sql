-- 0211 · Notificaciones (la campana de arriba) y avisos push: los pagos de las
-- familias y lo que pasa en las tareas por revisar de cada persona.
--
-- Cuando una familia sube un comprobante o paga con tarjeta, el colegio se
-- enteraba por un correo o entrando a revisar «Pagos» a ver si había algo. Esto
-- le da un lugar dentro del sistema: una campana junto a «Asistencia» con lo que
-- llegó, y —si la persona lo activa en su dispositivo— un aviso push al celular
-- o al navegador en el momento en que cae el pago.
--
-- Tres tablas:
--   · `notificaciones`        lo que pasó, por empresa. Una fila por pago; el
--                             índice único (team, tipo, ref) hace que un
--                             reintento del callback no avise dos veces. Con
--                             `user_id` es PERSONAL (una respuesta en una tarea
--                             suya): solo la ve esa persona. Sin él, la ve
--                             quien tenga el permiso de ese tipo.
--   · `notificaciones_leidas` hasta cuándo ha visto cada persona. «No leída» es
--                             toda la que se creó después de esa marca; así no
--                             hay una fila por persona y por aviso.
--   · `push_suscripciones`    los dispositivos que activaron los avisos. El
--                             `endpoint` es único: es la identidad del
--                             dispositivo ante el servicio de push.
--
-- Aditiva e idempotente: no toca ninguna tabla existente y se puede correr dos
-- veces. Se puede correr antes del deploy; el código de antes no las lee.

CREATE TABLE IF NOT EXISTS notificaciones (
  id             serial PRIMARY KEY,
  team_id        integer      NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  -- Para quién es, si es personal (tipo «tarea»). NULL = de la empresa.
  user_id        integer      REFERENCES users(id) ON DELETE CASCADE,
  -- comprobante | pago_en_linea | tarea
  tipo           varchar(30)  NOT NULL,
  titulo         varchar(160) NOT NULL,
  detalle        text,
  -- Ruta relativa de la pantalla donde se encuentra ese pago.
  enlace         varchar(300) NOT NULL,
  -- El comprobante o el enlace de pago que la originó (para no repetirla).
  ref_id         integer,
  monto_centavos integer,
  creado_en      timestamp    NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS notificaciones_team_creado_idx ON notificaciones (team_id, creado_en DESC);
CREATE INDEX IF NOT EXISTS notificaciones_user_creado_idx ON notificaciones (user_id, creado_en DESC) WHERE user_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS notificaciones_ref_uq ON notificaciones (team_id, tipo, ref_id) WHERE ref_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS notificaciones_leidas (
  user_id     integer   NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  team_id     integer   NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  -- Todo lo creado hasta este momento ya lo vio.
  leido_hasta timestamp NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, team_id)
);

CREATE TABLE IF NOT EXISTS push_suscripciones (
  id         serial PRIMARY KEY,
  user_id    integer      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- La empresa activa cuando activó los avisos. El aviso le llega por ser
  -- miembro de la empresa del pago, no por esta columna.
  team_id    integer      NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  endpoint   text         NOT NULL UNIQUE,
  p256dh     text         NOT NULL,
  auth       text         NOT NULL,
  user_agent varchar(300),
  creado_en  timestamp    NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS push_suscripciones_user_idx ON push_suscripciones (user_id);
CREATE INDEX IF NOT EXISTS push_suscripciones_team_idx ON push_suscripciones (team_id);
