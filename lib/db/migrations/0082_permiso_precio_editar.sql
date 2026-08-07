-- Permiso nuevo: 'facturas:precio-editar' — cambiar el precio y el descuento
-- que trae el producto del catálogo al facturar.
--
-- Los permisos efectivos se leen de team_role_permissions, no del código, así
-- que un permiso nuevo NO le llega solo a nadie: hay que sembrarlo. Se le da a
-- los roles de sistema owner y admin de cada empresa; el resto (vendedor,
-- auditor y cualquier rol propio) nace SIN él y el administrador lo habilita
-- desde Equipo → Permisos si lo quiere.
INSERT INTO "team_role_permissions" ("team_role_id", "permission")
SELECT tr.id, 'facturas:precio-editar'
FROM "team_roles" tr
WHERE tr.key IN ('owner', 'admin')
ON CONFLICT ("team_role_id", "permission") DO NOTHING;
