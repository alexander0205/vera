-- Roles por empresa con permisos editables (feature/rol-lector).
-- Cada team tiene sus roles: 4 de sistema (owner/admin/user/lector) sembrados
-- + los custom que cree. Permisos efectivos en lib/auth/permissions.ts.
--
-- El SEED de team_roles + team_role_permissions para los teams EXISTENTES lo
-- hace scripts/seed-team-roles.ts (lee lib/config/roles.ts como fuente única).
-- Correr DESPUÉS de aplicar este SQL:  npx tsx scripts/seed-team-roles.ts

-- ── Tablas ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS team_roles (
  id           SERIAL PRIMARY KEY,
  team_id      INTEGER NOT NULL REFERENCES teams(id),
  key          VARCHAR(50)  NOT NULL,
  label        VARCHAR(60)  NOT NULL,
  description  VARCHAR(255),
  icon         VARCHAR(40),
  color        VARCHAR(120),
  is_system    BOOLEAN NOT NULL DEFAULT false,
  created_at   TIMESTAMP NOT NULL DEFAULT now(),
  updated_at   TIMESTAMP NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS team_roles_team_key_idx
  ON team_roles(team_id, key);

CREATE TABLE IF NOT EXISTS team_role_permissions (
  id            SERIAL PRIMARY KEY,
  team_role_id  INTEGER NOT NULL REFERENCES team_roles(id) ON DELETE CASCADE,
  permission    VARCHAR(50) NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS team_role_perm_idx
  ON team_role_permissions(team_role_id, permission);

-- ── Limpieza de roles legacy (contador/vendedor/member → user) ──────────────
-- Mismos permisos que 'user'; cero pérdida de acceso.
UPDATE team_members
   SET role = 'user'
 WHERE role IN ('contador', 'vendedor', 'member');

-- Invitaciones legacy: borrar las canceladas, remapear el resto a 'user'.
DELETE FROM invitations
 WHERE role IN ('contador', 'vendedor', 'member')
   AND status = 'cancelled';

UPDATE invitations
   SET role = 'user'
 WHERE role IN ('contador', 'vendedor', 'member');
