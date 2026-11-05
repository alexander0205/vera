-- 0216 · Equipo Zero: quién es DUEÑO de la plataforma y la campana del panel.
--
-- Hasta hoy el panel `/admin` lo abre cualquiera con `users.platform_role =
-- 'admin'`, y esos admin solo salían de un seed. Esto deja agregar más desde el
-- panel (`/admin/equipo`), con dos niveles:
--
--   · ADMIN  cualquier cuenta con `platform_role = 'admin'`. Ve y crea
--            negocios y usa el panel igual que el dueño.
--   · DUEÑO  un admin que además está en `platform_owners`. Es el único nivel
--            que puede agregar o quitar administradores. Un admin recién
--            agregado tiene acceso a TODAS las empresas; si además pudiera
--            agregar y quitar admins, podría dejar fuera al dueño o dejar
--            cuentas de respaldo. Por eso el nivel de arriba vive aparte.
--
-- El nivel NO es una columna de `users` a propósito: `getUser()` hace
-- `select *` sobre esa tabla en cada petición, y una columna nueva sin migrar
-- tumbaría el inicio de sesión de todo el mundo si el código llega a producción
-- antes que la migración. Con una tabla aparte, el código viejo ni se entera y
-- el nuevo falla CERRADO (si no existe, nadie es dueño y nadie puede agregar
-- ni quitar admins).
--
-- Dos tablas:
--   · `platform_owners`                    los dueños. Se agrega y se quita a
--                                          mano (SQL): la pantalla no lo toca.
--   · `notificaciones_plataforma_leidas`   hasta cuándo ha visto cada admin la
--                                          campana del panel. Aparte de
--                                          `notificaciones_leidas` porque esa
--                                          lleva una marca por EMPRESA, y la
--                                          campana del panel mira todas.
--
-- Arranque: si todavía no hay ningún dueño, lo es el admin de plataforma de
-- menor id (en producción, el único: la cuenta del fundador). Es idempotente:
-- si ya hay dueños, no toca nada.
--
-- Aditiva e idempotente: no modifica ninguna tabla existente y se puede correr
-- dos veces. Se puede correr antes del deploy; el código de antes no las lee.

CREATE TABLE IF NOT EXISTS platform_owners (
  user_id    integer   PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamp NOT NULL DEFAULT now()
);

INSERT INTO platform_owners (user_id)
SELECT MIN(id)
FROM users
WHERE platform_role = 'admin' AND deleted_at IS NULL
HAVING MIN(id) IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM platform_owners)
ON CONFLICT (user_id) DO NOTHING;

CREATE TABLE IF NOT EXISTS notificaciones_plataforma_leidas (
  user_id     integer   PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  leido_hasta timestamp NOT NULL DEFAULT now()
);
