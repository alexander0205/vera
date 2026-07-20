-- Permisos del módulo Administración Escolar.
-- Owner siempre tiene todos los permisos por código (getEffectivePermissions),
-- no necesita fila en team_role_permissions. Aquí solo se otorgan a admin/user/lector
-- para los teams EXISTENTES. Teams nuevos los reciben vía seedSystemRoles
-- (lib/config/roles.ts ya los incluye en ROLES).
--
-- Reparto:
--   administracion-escolar:ver          -> admin, user, lector
--   administracion-escolar:gestionar    -> admin, user
--   administracion-escolar:configurar   -> admin (solo administradores)
--   administracion-escolar:pagos        -> admin, user
--
-- Idempotente: NOT EXISTS evita duplicar si se corre dos veces.

INSERT INTO team_role_permissions (team_role_id, permission)
SELECT tr.id, perm.name
FROM team_roles tr
CROSS JOIN (VALUES
  ('admin',  'administracion-escolar:ver'),
  ('admin',  'administracion-escolar:gestionar'),
  ('admin',  'administracion-escolar:configurar'),
  ('admin',  'administracion-escolar:pagos'),
  ('user',   'administracion-escolar:ver'),
  ('user',   'administracion-escolar:gestionar'),
  ('user',   'administracion-escolar:pagos'),
  ('lector', 'administracion-escolar:ver')
) AS perm(role_key, name)
WHERE tr.key = perm.role_key
  AND NOT EXISTS (
    SELECT 1 FROM team_role_permissions p
    WHERE p.team_role_id = tr.id
      AND p.permission = perm.name
  );
