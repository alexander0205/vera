-- Normaliza los emails a minúsculas y evita que vuelvan a entrar con mayúsculas.
--
-- Motivo: /api/auth/forgot-password comparaba lower(input) contra la columna sin
-- normalizar, así que un usuario guardado como "Nombre@hotmail.com" nunca
-- matcheaba y el flujo devolvía success sin generar token ni enviar correo.
-- El login comparaba crudo contra crudo, de modo que el mismo usuario sí podía
-- entrar — por eso el fallo pasó desapercibido.

-- 1. Normalizar los datos existentes.
UPDATE users       SET email = lower(email) WHERE email <> lower(email);
UPDATE invitations SET email = lower(email) WHERE email <> lower(email);

-- 2. Impedir que se vuelva a insertar un email que solo difiera en mayúsculas.
--    users_email_unique (b-tree sobre la columna cruda) no lo cubre: para él
--    "A@x.com" y "a@x.com" son valores distintos.
CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_unique_idx ON users (lower(email));

-- 3. Acelerar las búsquedas por email de invitación (no es único: una misma
--    dirección puede tener invitaciones a varios teams).
CREATE INDEX IF NOT EXISTS invitations_email_lower_idx ON invitations (lower(email));
