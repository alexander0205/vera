-- Backfill de permisos agregados después de sembrar roles editables.
--
-- seedSystemRoles() solo crea roles faltantes. Si el role ya existe, no re-sincroniza
-- permisos porque esos roles pueden haber sido editados por empresa. Por eso cada
-- permiso nuevo que deba llegar a roles existentes necesita backfill explícito.
--
-- Idempotente: NOT EXISTS evita duplicados si se corre más de una vez.

INSERT INTO team_role_permissions (team_role_id, permission)
SELECT tr.id, 'maestros:gestionar'
FROM team_roles tr
WHERE tr.key = 'admin'
  AND NOT EXISTS (
    SELECT 1 FROM team_role_permissions p
    WHERE p.team_role_id = tr.id
      AND p.permission = 'maestros:gestionar'
  );
