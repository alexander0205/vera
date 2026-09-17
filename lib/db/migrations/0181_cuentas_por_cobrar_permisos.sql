-- Cuentas por cobrar deja de ser un rol y pasa a ser una característica: dos
-- permisos nuevos ('cuentas-por-cobrar:ver' y 'cuentas-por-cobrar:gestionar')
-- que se prenden/apagan al editar cualquier rol.
--
-- Los permisos efectivos se leen de team_role_permissions, no del código, y
-- seedSystemRoles solo siembra ROLES que falten (no permisos nuevos en roles
-- ya sembrados). Sin este backfill, en cada empresa que ya tenía sus roles de
-- sistema el módulo de cartera quedaría sin acceso para admin, vendedor y
-- auditor, porque los guards ahora exigen 'cuentas-por-cobrar:*'.
--
-- Reparto que preserva el acceso actual (antes: ver = facturas:ver, registrar
-- cobro = facturas:crear):
--   owner  → ver + gestionar   (owner igual computa todos, se incluye por consistencia)
--   admin  → ver + gestionar
--   user   → ver + gestionar   (el "Vendedor" ya registraba cobros)
--   lector → ver               (el "Auditor" ve la cartera en solo lectura)
-- El resto de los roles (cajero, personal del colegio y cualquier rol propio)
-- nace SIN la característica; el administrador la habilita desde Equipo → Permisos.

INSERT INTO "team_role_permissions" ("team_role_id", "permission")
SELECT tr.id, perm.permission
FROM "team_roles" tr
JOIN (VALUES
  ('owner',  'cuentas-por-cobrar:ver'),
  ('owner',  'cuentas-por-cobrar:gestionar'),
  ('admin',  'cuentas-por-cobrar:ver'),
  ('admin',  'cuentas-por-cobrar:gestionar'),
  ('user',   'cuentas-por-cobrar:ver'),
  ('user',   'cuentas-por-cobrar:gestionar'),
  ('lector', 'cuentas-por-cobrar:ver')
) AS perm(role_key, permission) ON perm.role_key = tr.key
ON CONFLICT ("team_role_id", "permission") DO NOTHING;
