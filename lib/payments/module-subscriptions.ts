/**
 * Suscripción modular por tabla (`team_modules`) — fuente de verdad.
 *
 * `team_modules` guarda, por (empresa, módulo): tier, estado y prueba gratis.
 * El gate de acceso (lib/auth/modules.ts) lee `teams.modulosHabilitados`, que
 * NO se edita a mano: se DERIVA de esta tabla con `deriveAndPersistModules`
 * cada vez que cambia una fila (trial, activación, expiración, webhook Stripe).
 *
 * Trial LOCAL: `startTrial` crea/pone una fila en 'trialing' con
 * trial_ends_at = now + TRIAL_DAYS, SIN Stripe (stripe_item_id = null). El cron
 * `trial-expira` la pasa a 'trial_expired' al vencer. Un módulo solo puede
 * probarse una vez por empresa (trial_started_at ya presente = ya lo usó).
 *
 * Catálogo de tiers: lib/config/module-plans.ts.
 */

import 'server-only';
import { and, eq, isNull, lt } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { teams, teamModules, type TeamModule } from '@/lib/db/schema';
import {
  MODULES,
  MODULE_DEPENDENCIES,
  type ModuleKey,
} from '@/lib/config/modules';
import {
  getTier,
  statusGrantsAccess,
  TRIAL_DAYS,
  type ModuleStatus,
} from '@/lib/config/module-plans';

// ─── Lectura ────────────────────────────────────────────────────────────────

/** Todas las filas team_modules de una empresa. */
export async function getModuleRows(teamId: number): Promise<TeamModule[]> {
  return db.select().from(teamModules).where(eq(teamModules.teamId, teamId));
}

/** Fila de un módulo concreto (o undefined). */
export async function getModuleRow(
  teamId: number,
  modulo: ModuleKey,
): Promise<TeamModule | undefined> {
  const [row] = await db
    .select()
    .from(teamModules)
    .where(and(eq(teamModules.teamId, teamId), eq(teamModules.modulo, modulo)))
    .limit(1);
  return row;
}

// ─── Derivación del gate ────────────────────────────────────────────────────

/**
 * Recalcula `teams.modulosHabilitados` desde las filas team_modules con estado
 * que da acceso (trialing / active / past_due) y lo persiste. Mantiene el flag
 * legacy `pos_habilitado` en sincronía. Devuelve la lista derivada.
 *
 * Llamar SIEMPRE tras modificar una fila de team_modules.
 */
export async function deriveAndPersistModules(teamId: number): Promise<ModuleKey[]> {
  const rows = await getModuleRows(teamId);
  const activos = new Set<ModuleKey>();
  for (const r of rows) {
    if (statusGrantsAccess(r.status as ModuleStatus) && MODULES.includes(r.modulo as ModuleKey)) {
      activos.add(r.modulo as ModuleKey);
    }
  }
  const habilitados = MODULES.filter(m => activos.has(m));

  await db
    .update(teams)
    .set({
      modulosHabilitados: habilitados,
      posHabilitado: activos.has('pos'), // compat legacy
      updatedAt: new Date(),
    })
    .where(eq(teams.id, teamId));

  return habilitados;
}

// ─── Trial local ────────────────────────────────────────────────────────────

export type StartTrialResult =
  | { ok: true; trialEndsAt: Date }
  | { ok: false; error: string };

/**
 * Inicia la prueba local de 15 días de un módulo para la empresa.
 *
 * Reglas:
 *  - El tier debe existir y pertenecer al módulo.
 *  - Dependencias: no se puede probar un add-on (pos/escolar) sin que
 *    Facturación esté activa o en prueba.
 *  - Un módulo solo se prueba UNA vez por empresa: si ya hubo trial
 *    (trial_started_at presente) o el módulo ya está activo, se rechaza.
 * Tras crear la fila, re-deriva el gate.
 */
export async function startTrial(
  teamId: number,
  modulo: ModuleKey,
  tierKey: string,
): Promise<StartTrialResult> {
  const tier = getTier(tierKey);
  if (!tier || tier.modulo !== modulo) {
    return { ok: false, error: 'Tier inválido para este módulo' };
  }

  // Dependencias: el add-on necesita su base activa/en-prueba.
  const rows = await getModuleRows(teamId);
  const activos = new Set(
    rows.filter(r => statusGrantsAccess(r.status as ModuleStatus)).map(r => r.modulo),
  );
  for (const dep of MODULE_DEPENDENCIES[modulo]) {
    if (!activos.has(dep)) {
      return { ok: false, error: `Requiere el módulo ${dep} activo` };
    }
  }

  const existing = rows.find(r => r.modulo === modulo);
  if (existing) {
    if (existing.trialStartedAt) {
      return { ok: false, error: 'Este módulo ya usó su prueba gratis' };
    }
    if (statusGrantsAccess(existing.status as ModuleStatus)) {
      return { ok: false, error: 'Este módulo ya está activo' };
    }
  }

  const now = new Date();
  const trialEndsAt = new Date(now.getTime() + TRIAL_DAYS * 24 * 60 * 60 * 1000);

  await db
    .insert(teamModules)
    .values({
      teamId,
      modulo,
      tier: tierKey,
      status: 'trialing',
      trialStartedAt: now,
      trialEndsAt,
      stripeItemId: null,
    })
    .onConflictDoUpdate({
      target: [teamModules.teamId, teamModules.modulo],
      set: {
        tier: tierKey,
        status: 'trialing',
        trialStartedAt: now,
        trialEndsAt,
        stripeItemId: null,
        updatedAt: now,
      },
    });

  await deriveAndPersistModules(teamId);
  return { ok: true, trialEndsAt };
}

// ─── Expiración de trials (cron) ────────────────────────────────────────────

/**
 * Pasa a 'trial_expired' toda prueba LOCAL vencida (status 'trialing', sin
 * stripe_item_id, trial_ends_at < now) y re-deriva el gate de las empresas
 * afectadas. Idempotente. Devuelve cuántos módulos expiró.
 *
 * Los trials de Stripe (stripe_item_id presente) NO se tocan: los gobierna el
 * webhook de Stripe.
 */
export async function expireTrials(now: Date = new Date()): Promise<number> {
  const vencidos = await db
    .update(teamModules)
    .set({ status: 'trial_expired', updatedAt: now })
    .where(
      and(
        eq(teamModules.status, 'trialing'),
        isNull(teamModules.stripeItemId),
        lt(teamModules.trialEndsAt, now),
      ),
    )
    .returning({ teamId: teamModules.teamId });

  const teamIds = [...new Set(vencidos.map(v => v.teamId))];
  for (const teamId of teamIds) {
    await deriveAndPersistModules(teamId);
  }
  return vencidos.length;
}

/** Días restantes de prueba de un módulo (>=0), o null si no está en trial. */
export function trialDaysLeft(row: Pick<TeamModule, 'status' | 'trialEndsAt'>, now: Date = new Date()): number | null {
  if (row.status !== 'trialing' || !row.trialEndsAt) return null;
  const ms = row.trialEndsAt.getTime() - now.getTime();
  return Math.max(0, Math.ceil(ms / (24 * 60 * 60 * 1000)));
}
