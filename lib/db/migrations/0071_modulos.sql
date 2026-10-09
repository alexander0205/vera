-- ─────────────────────────────────────────────────────────────────────────────
-- Módulos del producto (facturación / POS)
--
-- `modulos_habilitados`: array JSON de módulos activos de la empresa.
--   Valores válidos: "facturacion", "pos". Fuente de verdad del gate de
--   acceso (lib/auth/modules.ts). En producción se deriva de la suscripción
--   Stripe (un item por módulo); ver lib/payments/modulos.ts.
-- `modulos_override`: si no es NULL, el admin de plataforma fuerza esta lista
--   por encima del billing (comps, demos, soporte).
--
-- Backfill: toda empresa existente arranca con "facturacion"; las que tenían
-- pos_habilitado=true reciben además "pos". `pos_habilitado` queda como
-- columna legacy de solo-lectura hasta retirar su último consumidor.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE teams
  ADD COLUMN IF NOT EXISTS modulos_habilitados jsonb NOT NULL DEFAULT '["facturacion"]',
  ADD COLUMN IF NOT EXISTS modulos_override jsonb;

UPDATE teams
SET modulos_habilitados = '["facturacion","pos"]'::jsonb
WHERE pos_habilitado = true;

-- Permisos de acceso por módulo para los roles de sistema existentes.
-- owner tiene bypass total en código; admin/user reciben ambos módulos,
-- lector solo facturación (lectura). Idempotente.
INSERT INTO team_role_permissions (team_role_id, permission)
SELECT tr.id, p.permission
FROM team_roles tr
CROSS JOIN (VALUES ('modulo:facturacion'), ('modulo:pos')) AS p(permission)
WHERE tr.key IN ('admin', 'user')
ON CONFLICT DO NOTHING;

INSERT INTO team_role_permissions (team_role_id, permission)
SELECT tr.id, 'modulo:facturacion'
FROM team_roles tr
WHERE tr.key = 'lector'
ON CONFLICT DO NOTHING;
