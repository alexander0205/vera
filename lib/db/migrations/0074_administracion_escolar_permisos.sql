-- Permisos del módulo Administración Escolar.
--
-- OPT-IN: el módulo no es para todas las empresas. Esta migración NO lo
-- reparte a todo el mundo — solo rellena los permisos de las empresas que YA
-- lo tienen activo (modulos_habilitados / modulos_override contienen
-- "escolar"). En una base sin ninguna empresa escolar no toca una sola fila.
--
-- Para ACTIVARLE el módulo a una empresa se usa scripts/activar-modulo-escolar.ts,
-- que enciende el módulo y siembra estos mismos permisos en un solo paso.
--
-- Owner tiene todos los permisos por código (getEffectivePermissions), no
-- necesita filas. Empresas nuevas los reciben vía seedSystemRoles, que lee
-- ROLES de lib/config/roles.ts — este reparto debe espejarlo:
--   admin            -> ver, gestionar, configurar, pagos + modulo:escolar
--   lector (Auditor) -> ver  (sin modulo:escolar: solo si el dueño se lo abre)
--   user (Vendedor)  -> nada: un vendedor no matricula estudiantes
--   personal-escolar -> rol nuevo; lo siembra seedSystemRoles, no esta migración
--
-- Idempotente: ON CONFLICT DO NOTHING permite re-correrla tras activar más
-- empresas.

INSERT INTO team_role_permissions (team_role_id, permission)
SELECT tr.id, perm.name
FROM team_roles tr
JOIN teams t ON t.id = tr.team_id
CROSS JOIN (VALUES
  ('admin',  'administracion-escolar:ver'),
  ('admin',  'administracion-escolar:gestionar'),
  ('admin',  'administracion-escolar:configurar'),
  ('admin',  'administracion-escolar:pagos'),
  ('admin',  'modulo:escolar'),
  ('lector', 'administracion-escolar:ver')
) AS perm(role_key, name)
WHERE tr.key = perm.role_key
  AND (
    t.modulos_habilitados @> '["escolar"]'::jsonb
    OR t.modulos_override  @> '["escolar"]'::jsonb
  )
ON CONFLICT DO NOTHING;
