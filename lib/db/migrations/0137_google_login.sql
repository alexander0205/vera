-- Login con Google.
--
-- `google_id` es el `sub` del token de Google: su identificador estable del
-- usuario. Se guarda ese y no el correo porque el correo de una cuenta de
-- Google Workspace se puede cambiar, y si atáramos la cuenta al correo, el
-- día que a alguien le cambian el suyo entraría como otra persona distinta.
--
-- Índice único PARCIAL y no una restricción UNIQUE normal: casi todas las
-- filas van a tener NULL aquí —quien entra con contraseña no tiene Google— y
-- el índice solo tiene que cubrir a los que sí.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS google_id varchar(64);

CREATE UNIQUE INDEX IF NOT EXISTS users_google_id_unico
  ON users (google_id)
  WHERE google_id IS NOT NULL;
