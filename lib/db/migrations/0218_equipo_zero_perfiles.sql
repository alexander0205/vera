-- 0218 · Equipo Zero: la foto y el cargo de cada administrador de la plataforma.
--
-- En `/admin/equipo` cada persona del equipo puede poner su foto y su cargo
-- («Soporte técnico», «Ventas»…). Lo edita la propia persona o el dueño de la
-- plataforma (ver la 0216).
--
-- Tabla aparte de `users` por la misma razón que `platform_owners`: `getUser()`
-- hace `select *` sobre `users` en cada petición, y una columna nueva sin
-- migrar tumbaría el inicio de sesión de todos si el código llega antes que la
-- migración. Con la tabla aparte, el código nuevo sin migrar solo deja de
-- enseñar fotos y cargos.
--
-- La foto se guarda en la propia base (`bytea`): llega ya recortada a 256×256
-- desde el navegador y pesa unos pocos KB; son pocas cuentas. Así no depende de
-- S3 ni de una URL firmada que caduca, y la sirve una ruta del panel que exige
-- ser administrador.
--
-- `foto_version` sube con cada foto nueva: va en la URL (`?v=`) para que el
-- navegador pueda guardarla en caché sin enseñar una vieja.
--
-- Aditiva e idempotente: no toca ninguna tabla existente y se puede correr dos
-- veces. Se puede correr antes del deploy; el código de antes no la lee.

CREATE TABLE IF NOT EXISTS equipo_zero_perfiles (
  user_id         integer     PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  cargo           varchar(80),
  foto            bytea,
  foto_tipo       varchar(20),
  foto_version    integer     NOT NULL DEFAULT 0,
  actualizado_en  timestamp   NOT NULL DEFAULT now(),
  actualizado_por integer     REFERENCES users(id) ON DELETE SET NULL
);
