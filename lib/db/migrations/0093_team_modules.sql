-- Suscripción modular — un renglón por (empresa, módulo).
--
-- Fuente de verdad del billing por módulo (facturacion / pos / escolar): tier
-- contratado, estado y prueba gratis. `teams.modulos_habilitados` (el gate de
-- acceso) se deriva de esta tabla; el catálogo de tiers vive en
-- lib/config/module-plans.ts.
--
-- Backfill: se recrea el estado modular actual desde modulos_habilitados.
--  · Facturación = base obligatoria → toda empresa, tier fact_250 (decisión de
--    negocio: todo lo existente migra al tier de 250K).
--  · POS      → empresas con "pos" en modulos_habilitados, tier pos_std.
--  · Colegio  → empresas con "escolar", tier por # de estudiantes (≤100 → col_100).
-- Todas quedan en status 'active' (data real ya en uso; no son pruebas).

CREATE TABLE IF NOT EXISTS team_modules (
  id                serial PRIMARY KEY,
  team_id           integer NOT NULL REFERENCES teams(id),
  modulo            varchar(20) NOT NULL,
  tier              varchar(30) NOT NULL,
  status            varchar(20) NOT NULL DEFAULT 'active',
  trial_started_at  timestamp,
  trial_ends_at     timestamp,
  stripe_item_id    text,
  created_at        timestamp NOT NULL DEFAULT now(),
  updated_at        timestamp NOT NULL DEFAULT now(),
  CONSTRAINT team_modules_team_modulo_uq UNIQUE (team_id, modulo),
  CONSTRAINT team_modules_modulo_chk CHECK (modulo IN ('facturacion', 'pos', 'escolar')),
  CONSTRAINT team_modules_status_chk CHECK (
    status IN ('trialing', 'active', 'trial_expired', 'canceled', 'past_due')
  )
);

-- ── Backfill: Facturación (base) para toda empresa ───────────────────────────
INSERT INTO team_modules (team_id, modulo, tier, status)
SELECT id, 'facturacion', 'fact_250', 'active'
FROM teams
ON CONFLICT (team_id, modulo) DO NOTHING;

-- ── Backfill: POS para empresas que lo tienen habilitado ─────────────────────
INSERT INTO team_modules (team_id, modulo, tier, status)
SELECT id, 'pos', 'pos_std', 'active'
FROM teams
WHERE modulos_habilitados @> '["pos"]'::jsonb
ON CONFLICT (team_id, modulo) DO NOTHING;

-- ── Backfill: Colegio, tier según # de estudiantes matriculados ──────────────
INSERT INTO team_modules (team_id, modulo, tier, status)
SELECT t.id, 'escolar',
       CASE WHEN COALESCE(e.n, 0) <= 100 THEN 'col_100' ELSE 'col_200' END,
       'active'
FROM teams t
LEFT JOIN (
  SELECT team_id, count(*)::int AS n
  FROM admin_escolar_estudiantes
  GROUP BY team_id
) e ON e.team_id = t.id
WHERE t.modulos_habilitados @> '["escolar"]'::jsonb
ON CONFLICT (team_id, modulo) DO NOTHING;
