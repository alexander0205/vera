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
import type Stripe from 'stripe';
import { and, eq, gte, isNull, lt, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { stripe } from '@/lib/payments/stripe';
import {
  teams,
  teamModules,
  ecfDocuments,
  adminEscolarEstudiantes,
  type TeamModule,
  type Team,
} from '@/lib/db/schema';
import {
  MODULES,
  MODULE_DEPENDENCIES,
  type ModuleKey,
} from '@/lib/config/modules';
import {
  getTier,
  getTierPriceId,
  tierForPriceId,
  statusGrantsAccess,
  TRIAL_DAYS,
  type ModuleStatus,
  type ModuleTier,
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

// ─── Topes por tier ─────────────────────────────────────────────────────────

/**
 * Definición de tier del módulo, solo si la empresa lo tiene con acceso
 * (trialing/active/past_due). undefined si no está activo o el tier no existe.
 */
export async function getModuleTierDef(
  teamId: number,
  modulo: ModuleKey,
): Promise<ModuleTier | undefined> {
  const row = await getModuleRow(teamId, modulo);
  if (!row || !statusGrantsAccess(row.status as ModuleStatus)) return undefined;
  return getTier(row.tier);
}

/**
 * Monto facturado en el mes calendario en curso, en centavos DOP. Suma
 * `ecfDocuments.montoTotal` de los comprobantes emitidos (excluye borradores y
 * anulados). Mismo período que getMonthlyEcfCount (mes calendario, hora server).
 */
export async function getMonthlyFacturadoCents(
  teamId: number,
  now: Date = new Date(),
): Promise<number> {
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const [r] = await db
    .select({ total: sql<string>`COALESCE(SUM(${ecfDocuments.montoTotal}), 0)` })
    .from(ecfDocuments)
    .where(
      and(
        eq(ecfDocuments.teamId, teamId),
        gte(ecfDocuments.createdAt, startOfMonth),
        sql`${ecfDocuments.estado} != 'BORRADOR'`,
        sql`${ecfDocuments.estado} NOT LIKE 'ANULAD%'`,
      ),
    );
  return Number(r?.total ?? 0);
}

export interface FacturacionTope {
  /** Tope de monto/mes en centavos DOP. null = ilimitado (sin tope). */
  topeCents: number | null;
  /** Facturado en el mes en curso, centavos DOP. */
  usadoCents: number;
  /** false = alcanzó el tope → bloquear emisión. */
  allowed: boolean;
  tierKey: string | null;
  tierLabel: string | null;
}

/**
 * Estado del tope de facturación de una empresa. Bloquea (`allowed=false`)
 * cuando lo ya facturado en el mes llega o supera el tope del tier.
 * Sin módulo Facturación activo o tier sin tope → ilimitado.
 */
export async function getFacturacionTope(
  teamId: number,
  now: Date = new Date(),
): Promise<FacturacionTope> {
  const tier = await getModuleTierDef(teamId, 'facturacion');
  const topeCents = tier?.topeMontoCents ?? null;
  const usadoCents = await getMonthlyFacturadoCents(teamId, now);
  return {
    topeCents,
    usadoCents,
    allowed: topeCents === null || usadoCents < topeCents,
    tierKey: tier?.key ?? null,
    tierLabel: tier?.label ?? null,
  };
}

export interface ColegioTope {
  /** Tope de estudiantes del tier. null = ilimitado. */
  topeEstudiantes: number | null;
  /** Estudiantes en el roster (excluye retirado/graduado). */
  usados: number;
  /** false = alcanzó el tope → bloquear matrícula. */
  allowed: boolean;
  tierKey: string | null;
  tierLabel: string | null;
}

/**
 * Estado del tope de estudiantes de una empresa (módulo Colegio). Cuenta el
 * roster activo (estados distintos de retirado/graduado). Sin módulo Escolar
 * activo o tier sin tope → ilimitado.
 */
export async function getColegioTope(teamId: number): Promise<ColegioTope> {
  const tier = await getModuleTierDef(teamId, 'escolar');
  const topeEstudiantes = tier?.topeEstudiantes ?? null;
  const [r] = await db
    .select({ n: sql<string>`count(*)` })
    .from(adminEscolarEstudiantes)
    .where(
      and(
        eq(adminEscolarEstudiantes.teamId, teamId),
        sql`${adminEscolarEstudiantes.estado} NOT IN ('retirado', 'graduado')`,
      ),
    );
  const usados = Number(r?.n ?? 0);
  return {
    topeEstudiantes,
    usados,
    allowed: topeEstudiantes === null || usados < topeEstudiantes,
    tierKey: tier?.key ?? null,
    tierLabel: tier?.label ?? null,
  };
}

// ─── Billing por Stripe (tier-aware) ─────────────────────────────────────────

/** Mapea el estado de una suscripción Stripe a nuestro ModuleStatus. */
function mapStripeStatus(s: Stripe.Subscription.Status): ModuleStatus {
  if (s === 'active') return 'active';
  if (s === 'trialing') return 'trialing';
  if (s === 'past_due') return 'past_due';
  return 'canceled'; // canceled | unpaid | incomplete | incomplete_expired | paused
}

/**
 * Deriva y persiste team_modules desde una suscripción Stripe: cada item cuyo
 * price mapea a un tier (tierForPriceId) genera/actualiza su fila (modulo, tier,
 * status, stripeItemId). Los módulos que estaban facturados por Stripe pero ya
 * no están en la suscripción se marcan 'canceled'. Los trials LOCALES
 * (stripe_item_id NULL) y módulos manuales NO se tocan. Al final re-deriva el
 * gate (modulosHabilitados).
 */
export async function syncTeamModulesFromStripe(
  teamId: number,
  subscription: Stripe.Subscription,
): Promise<void> {
  const status = mapStripeStatus(subscription.status);
  const now = new Date();
  const seen = new Set<ModuleKey>();

  for (const item of subscription.items.data) {
    const tier = tierForPriceId(item.price?.id ?? '');
    if (!tier) continue; // price ajeno al modelo modular
    seen.add(tier.modulo);
    await db
      .insert(teamModules)
      .values({
        teamId,
        modulo: tier.modulo,
        tier: tier.key,
        status,
        stripeItemId: item.id,
      })
      .onConflictDoUpdate({
        target: [teamModules.teamId, teamModules.modulo],
        set: { tier: tier.key, status, stripeItemId: item.id, updatedAt: now },
      });
  }

  // Módulos antes facturados por Stripe que ya no están en la sub → cancelar.
  // (Los trials locales tienen stripe_item_id NULL y se preservan.)
  const rows = await getModuleRows(teamId);
  for (const r of rows) {
    if (r.stripeItemId && !seen.has(r.modulo as ModuleKey)) {
      await db
        .update(teamModules)
        .set({ status: 'canceled', updatedAt: now })
        .where(eq(teamModules.id, r.id));
    }
  }

  await deriveAndPersistModules(teamId);
}

/**
 * Activa/cambia un módulo con COBRO por Stripe:
 *  - con suscripción existente → agrega (o cambia el tier de) su item con
 *    prorrateo, sincroniza team_modules y devuelve {ok:true}.
 *  - sin suscripción → devuelve {checkoutUrl} para completar el pago; al volver,
 *    el checkout/webhook llama syncTeamModulesFromStripe.
 *
 * Valida tier↔módulo, dependencias (base Facturación) y price configurado.
 */
export async function activarModulo(
  team: Team,
  modulo: ModuleKey,
  tierKey: string,
  actorUserId: number,
): Promise<{ ok: true } | { checkoutUrl: string }> {
  const tier = getTier(tierKey);
  if (!tier || tier.modulo !== modulo) throw new Error('Tier inválido para este módulo');
  const priceId = getTierPriceId(tierKey);
  if (!priceId) throw new Error('Este tier no tiene price de Stripe configurado');

  // Dependencias: un add-on requiere su base activa/en-prueba.
  if (modulo !== 'facturacion') {
    const rows = await getModuleRows(team.id);
    const activos = new Set(
      rows.filter(r => statusGrantsAccess(r.status as ModuleStatus)).map(r => r.modulo),
    );
    for (const dep of MODULE_DEPENDENCIES[modulo]) {
      if (!activos.has(dep)) throw new Error(`Requiere el módulo ${dep} activo`);
    }
  }

  if (team.stripeSubscriptionId) {
    const existing = await getModuleRow(team.id, modulo);
    if (existing?.stripeItemId) {
      // Ya facturado por Stripe → cambiar el tier del item (prorrateado).
      await stripe.subscriptionItems.update(existing.stripeItemId, {
        price: priceId,
        proration_behavior: 'create_prorations',
      });
    } else {
      // Nuevo item en la suscripción existente.
      await stripe.subscriptionItems.create({
        subscription: team.stripeSubscriptionId,
        price: priceId,
        quantity: 1,
        proration_behavior: 'create_prorations',
      });
    }
    const sub = await stripe.subscriptions.retrieve(team.stripeSubscriptionId, {
      expand: ['items.data.price'],
    });
    await syncTeamModulesFromStripe(team.id, sub);
    return { ok: true };
  }

  // Sin suscripción → checkout (crea la suscripción con este primer item).
  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    payment_method_types: ['card'],
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${process.env.BASE_URL}/api/stripe/checkout?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${process.env.BASE_URL}/pricing`,
    customer: team.stripeCustomerId || undefined,
    client_reference_id: `${actorUserId}:${team.id}`,
    allow_promotion_codes: true,
  });
  return { checkoutUrl: session.url! };
}
