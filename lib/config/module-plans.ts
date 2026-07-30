/**
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║  FUENTE DE VERDAD — Tiers de suscripción por módulo               ║
 * ║                                                                  ║
 * ║  Modelo modular: cada empresa contrata módulos por separado      ║
 * ║  (facturacion / pos / escolar), y cada módulo tiene sus tiers.   ║
 * ║  Facturación es el módulo base (ver MODULE_DEPENDENCIES).        ║
 * ║                                                                  ║
 * ║  Para agregar/cambiar un tier:                                   ║
 * ║  1. Editar MODULE_TIERS aquí                                     ║
 * ║  2. Agregar el STRIPE_PRICE_* correspondiente a .env             ║
 * ║  3. El gate, los topes y la UI se derivan de esto                ║
 * ╚══════════════════════════════════════════════════════════════════╝
 *
 * Client-safe: solo catálogo y helpers puros (sin DB, sin process.env salvo
 * lectura de price IDs server-side vía getTierPriceId). El estado por empresa
 * vive en la tabla `team_modules` (lib/db/schema.ts).
 */

import type { ModuleKey } from './modules';

// ─── Estado de un módulo contratado ─────────────────────────────────────────
// trialing      → prueba local de 15 días (sin tarjeta) o trial de Stripe
// active        → pago al día (o comp de admin)
// trial_expired → se agotaron los 15 días sin convertir a pago → bloquea
// canceled      → suscripción cancelada / no pagada → bloquea
// past_due      → pago atrasado; gracia (banner en UI, sin corte inmediato)
export type ModuleStatus =
  | 'trialing'
  | 'active'
  | 'trial_expired'
  | 'canceled'
  | 'past_due';

/** Estados que dan acceso al módulo (gate). */
export const MODULE_ACTIVE_STATUSES: readonly ModuleStatus[] = [
  'trialing',
  'active',
  'past_due',
];

/** Días de la prueba gratis local (por negocio y por módulo). */
export const TRIAL_DAYS = 15;

// ─── Definición de un tier ──────────────────────────────────────────────────

export interface ModuleTier {
  /** Clave interna única GLOBAL (no solo dentro del módulo). Ej: 'fact_250'. */
  key: string;
  /** Módulo al que pertenece. */
  modulo: ModuleKey;
  /** Nombre de display. */
  label: string;
  /** Precio USD/mes. */
  price: number;
  /** Nombre de la env var con el Stripe Price ID. */
  priceEnvKey: string;
  /** Tope de miembros del equipo. -1 = ilimitado. */
  users: number;
  /**
   * Facturación: tope de monto facturado por mes, en CENTAVOS DOP.
   * Al superarlo se bloquea la emisión. undefined = sin tope de monto.
   */
  topeMontoCents?: number;
  /**
   * Colegio: tope de estudiantes matriculados. Al superarlo se bloquea
   * matricular. undefined = sin tope de estudiantes.
   */
  topeEstudiantes?: number;
  ui: {
    description: string;
    /** Lista corta para la pricing card. */
    marketingFeatures: string[];
    /** Destacar esta card. */
    highlighted?: boolean;
  };
}

// ─── Catálogo ───────────────────────────────────────────────────────────────
// El orden dentro de cada módulo es el orden en la pricing page.

export const MODULE_TIERS: Record<ModuleKey, ModuleTier[]> = {
  facturacion: [
    {
      key: 'fact_250',
      modulo: 'facturacion',
      label: 'Facturación 250K',
      price: 20,
      priceEnvKey: 'STRIPE_PRICE_FACT_250',
      users: 2,
      topeMontoCents: 25_000_000, // RD$250,000 / mes
      ui: {
        description: 'Para negocios pequeños',
        marketingFeatures: [
          'Hasta RD$250,000 facturados/mes',
          '2 usuarios',
          'Facturas electrónicas (e-CF)',
          'Notas de crédito',
        ],
      },
    },
    {
      key: 'fact_600',
      modulo: 'facturacion',
      label: 'Facturación 600K',
      price: 30,
      priceEnvKey: 'STRIPE_PRICE_FACT_600',
      users: 3,
      topeMontoCents: 60_000_000, // RD$600,000 / mes
      ui: {
        description: 'Para negocios en crecimiento',
        highlighted: true,
        marketingFeatures: [
          'Hasta RD$600,000 facturados/mes',
          '3 usuarios',
          'Facturas electrónicas (e-CF)',
          'Notas de crédito',
        ],
      },
    },
  ],

  pos: [
    {
      key: 'pos_std',
      modulo: 'pos',
      label: 'Punto de Venta',
      price: 10,
      priceEnvKey: 'STRIPE_PRICE_POS',
      users: 1,
      ui: {
        description: 'Terminal de venta (requiere Facturación)',
        marketingFeatures: [
          'Terminal de venta',
          'Turnos de caja',
          '1 usuario',
        ],
      },
    },
  ],

  escolar: [
    {
      key: 'col_100',
      modulo: 'escolar',
      label: 'Colegio 100',
      price: 90,
      priceEnvKey: 'STRIPE_PRICE_COLEGIO_100',
      users: -1,
      topeEstudiantes: 100,
      ui: {
        description: 'Hasta 100 estudiantes (requiere Facturación)',
        marketingFeatures: [
          'Hasta 100 estudiantes',
          'Matrículas, cargos y mensualidad',
          'Usuarios ilimitados',
        ],
      },
    },
    {
      key: 'col_200',
      modulo: 'escolar',
      label: 'Colegio 200',
      price: 170,
      priceEnvKey: 'STRIPE_PRICE_COLEGIO_200',
      users: -1,
      topeEstudiantes: 200,
      ui: {
        description: 'Hasta 200 estudiantes (requiere Facturación)',
        highlighted: true,
        marketingFeatures: [
          'Hasta 200 estudiantes',
          'Matrículas, cargos y mensualidad',
          'Usuarios ilimitados',
        ],
      },
    },
  ],
};

// ─── Defaults de migración/onboarding ───────────────────────────────────────
// Tier con el que arranca cada módulo cuando no se especifica otro.
// (Facturación: decisión de negocio — todo lo viejo migra al tier 250K.)
export const DEFAULT_TIER: Record<ModuleKey, string> = {
  facturacion: 'fact_250',
  pos: 'pos_std',
  escolar: 'col_100',
};

// ─── Helpers puros ──────────────────────────────────────────────────────────

/** Todos los tiers, aplanados. */
export const ALL_TIERS: ModuleTier[] = Object.values(MODULE_TIERS).flat();

/** Tiers de un módulo (orden de pricing). */
export function getModuleTiers(modulo: ModuleKey): ModuleTier[] {
  return MODULE_TIERS[modulo] ?? [];
}

/** Busca un tier por su clave global. undefined si no existe. */
export function getTier(tierKey: string | null | undefined): ModuleTier | undefined {
  if (!tierKey) return undefined;
  return ALL_TIERS.find(t => t.key === tierKey);
}

/** Tier por defecto (definición) de un módulo. */
export function getDefaultTier(modulo: ModuleKey): ModuleTier {
  const key = DEFAULT_TIER[modulo];
  const tier = getTier(key);
  if (!tier) throw new Error(`DEFAULT_TIER inválido para ${modulo}: ${key}`);
  return tier;
}

/**
 * Stripe Price ID de un tier. Solo server-side (lee process.env).
 * '' si no está configurado (deploy sin billing → módulos manuales).
 */
export function getTierPriceId(tierKey: string): string {
  const tier = getTier(tierKey);
  if (!tier?.priceEnvKey) return '';
  return process.env[tier.priceEnvKey] ?? '';
}

/** Tier a partir de un Stripe Price ID. Solo server-side. */
export function tierForPriceId(priceId: string): ModuleTier | undefined {
  if (!priceId) return undefined;
  return ALL_TIERS.find(t => t.priceEnvKey && process.env[t.priceEnvKey] === priceId);
}

/** Precio formateado (ej: "$20 USD/mes"). */
export function getTierPriceLabel(tierKey: string): string {
  const tier = getTier(tierKey);
  if (!tier) return '';
  return `$${tier.price} USD/mes`;
}

/** ¿El status da acceso al módulo? */
export function statusGrantsAccess(status: ModuleStatus | string | null | undefined): boolean {
  return MODULE_ACTIVE_STATUSES.includes(status as ModuleStatus);
}
