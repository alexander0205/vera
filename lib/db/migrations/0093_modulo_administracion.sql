-- Módulo "administracion" como módulo base de toda empresa.
--
-- Administración (/cuenta: mi empresa, usuarios, roles) dejó de ser un área
-- suelta y pasó a ser un módulo del catálogo, para que se vea y se administre
-- junto a los demás desde el panel admin. Como toda empresa lo necesita, entra
-- en los módulos base junto a facturación: se agrega a todas las filas
-- existentes y al default de la columna.
--
-- Aditiva e idempotente: no quita módulos ya activos.

-- 1) Default de la columna para empresas nuevas.
ALTER TABLE teams
  ALTER COLUMN modulos_habilitados SET DEFAULT '["facturacion", "administracion"]'::jsonb;

-- 2) Empresas existentes: agregar los módulos base que les falten, conservando
--    los que ya tengan (pos, escolar, …).
UPDATE teams
SET modulos_habilitados = (
  SELECT jsonb_agg(DISTINCT m)
  FROM jsonb_array_elements(
    coalesce(modulos_habilitados, '[]'::jsonb) || '["facturacion", "administracion"]'::jsonb
  ) AS m
)
WHERE NOT (coalesce(modulos_habilitados, '[]'::jsonb) @> '["facturacion", "administracion"]'::jsonb);

-- 3) Lo mismo para el override manual del admin, solo donde esté definido.
--    Un override sin administración dejaría al dueño sin acceso a su empresa.
UPDATE teams
SET modulos_override = (
  SELECT jsonb_agg(DISTINCT m)
  FROM jsonb_array_elements(modulos_override || '["facturacion", "administracion"]'::jsonb) AS m
)
WHERE modulos_override IS NOT NULL
  AND NOT (modulos_override @> '["facturacion", "administracion"]'::jsonb);

-- 4) Todos los roles pueden entrar al módulo Administración; las páginas de
--    adentro siguen protegidas por sus propios permisos (usuarios, roles,
--    empresa). Sin esto, un rol con permisos personalizados por empresa
--    perdería el acceso que tenía antes de que Administración fuera módulo.
--    Una fila por permiso (team_role_id, permission).
INSERT INTO team_role_permissions (team_role_id, permission)
SELECT tr.id, 'modulo:administracion'
FROM team_roles tr
WHERE NOT EXISTS (
  SELECT 1 FROM team_role_permissions trp
  WHERE trp.team_role_id = tr.id
    AND trp.permission = 'modulo:administracion'
);
