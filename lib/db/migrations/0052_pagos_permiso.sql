-- Permiso `pagos:ver` para el módulo de Pagos recibidos (/dashboard/pagos).
-- Por ahora SOLO admin (y owner, que tiene todos los permisos por definición).
--
-- Otorga el permiso al rol de sistema 'admin' de cada team EXISTENTE. Los teams
-- nuevos lo reciben vía seedSystemRoles (lib/config/roles.ts ya lo incluye en
-- owner + admin). 'user' y 'lector' NO lo reciben (módulo restringido).
--
-- Idempotente: el NOT EXISTS evita duplicar si se corre dos veces.
INSERT INTO team_role_permissions (team_role_id, permission)
SELECT tr.id, 'pagos:ver'
FROM team_roles tr
WHERE tr.key = 'admin'
  AND NOT EXISTS (
    SELECT 1 FROM team_role_permissions p
    WHERE p.team_role_id = tr.id
      AND p.permission = 'pagos:ver'
  );
