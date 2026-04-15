/**
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║  FUENTE DE VERDAD — Planes de EmiteDO                           ║
 * ║                                                                  ║
 * ║  Para agregar o modificar un plan:                               ║
 * ║  1. Editar el array PLANS aquí abajo                             ║
 * ║  2. Agregar STRIPE_PRICE_<PLAN> a .env                           ║
 * ║  3. El resto del sistema se actualiza solo                       ║
 * ╚══════════════════════════════════════════════════════════════════╝
 */

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * Features funcionales del producto.
 * Cada feature activa/desactiva acceso a secciones del sistema.
 * Añadir una feature nueva = agregar aquí + en las features[] del plan correspondiente.
 */
export type Feature =
  | 'clientes'
  | 'productos'
  | 'cotizaciones'
  | 'facturas-recurrentes'
  | 'inventario-avanzado'   // almacenes, categorías, listas de precios, vendedores
  | 'reportes'
  | 'actividad'
  | 'api-keys'
  | 'webhooks'
  | 'impresoras';

export interface PlanLimits {
  /** Comprobantes electrónicos por mes. -1 = ilimitado */
  docs: number;
  /** Miembros del equipo. -1 = ilimitado, 0 = sin acceso */
  users: number;
  /** Comprobantes durante el período de prueba (trial) */
  trialDocs: number;
}

export interface PlanDef {
  /** Clave interna (lowercase). Es lo que se guarda en teams.plan_name (lowercase). */
  key: string;
  /** Nombre de display. Debe coincidir con lo que envía Stripe en el webhook. */
  name: string;
  /** Precio en USD/mes (0 para planes gratuitos/sin plan) */
  price: number;
  /** Nombre de la variable de entorno con el Price ID de Stripe */
  priceEnvKey: string;
  limits: PlanLimits;
  /** Features habilitadas en este plan. Ausente = bloqueada. */
  features: Feature[];
  ui: {
    /** Descripción corta para la pricing page */
    description: string;
    /** Lista de features para la página de pricing (marketing copy) */
    marketingFeatures: string[];
    /** Clases Tailwind para el badge del plan */
    badgeColor: string;
    /** Si esta card se debe destacar en la pricing page */
    highlighted: boolean;
  };
}

// ─── Definición de planes ──────────────────────────────────────────────────────
// El orden aquí determina el orden en la pricing page

export const PLANS: PlanDef[] = [
  {
    key:         'starter',
    name:        'Starter',
    price:       15,
    priceEnvKey: 'STRIPE_PRICE_STARTER',
    limits: {
      docs:      200,
      users:     1,
      trialDocs: 30,
    },
    features: [],   // acceso base: facturas + notas de crédito únicamente
    ui: {
      description:       'Para freelancers y negocios unipersonales',
      badgeColor:        'bg-blue-50 text-blue-700 border-blue-200',
      highlighted:       false,
      marketingFeatures: [
        '200 comprobantes/mes',
        '1 usuario',
        'Facturas electrónicas (e-CF)',
        'Notas de crédito',
        'Gestión de empresa',
        'Soporte por email',
      ],
    },
  },
  {
    key:         'invoice',
    name:        'Invoice',
    price:       17,
    priceEnvKey: 'STRIPE_PRICE_INVOICE',
    limits: {
      docs:      -1,   // ilimitado
      users:     2,
      trialDocs: 30,
    },
    features: [
      'clientes',
      'productos',
    ],
    ui: {
      description:       'Solo facturación electrónica ilimitada',
      badgeColor:        'bg-orange-50 text-orange-700 border-orange-200',
      highlighted:       false,
      marketingFeatures: [
        'Comprobantes ilimitados',
        'Hasta 2 usuarios',
        'Facturas electrónicas (e-CF)',
        'Notas de crédito',
        'Gestión de clientes y productos',
        'Configuración de empresa',
        'Soporte por email',
      ],
    },
  },
  {
    key:         'business',
    name:        'Business',
    price:       35,
    priceEnvKey: 'STRIPE_PRICE_BUSINESS',
    limits: {
      docs:      800,
      users:     3,
      trialDocs: 30,
    },
    features: [
      'clientes',
      'productos',
      'cotizaciones',
      'facturas-recurrentes',
      'inventario-avanzado',
      'reportes',
      'actividad',
    ],
    ui: {
      description:       'Para PyMEs en crecimiento',
      badgeColor:        'bg-teal-50 text-teal-700 border-teal-200',
      highlighted:       true,
      marketingFeatures: [
        '800 comprobantes/mes',
        'Hasta 3 usuarios',
        'Todo lo de Starter +',
        'Clientes y productos',
        'Cotizaciones',
        'Facturas recurrentes',
        'Inventario (almacenes, categorías, listas de precios)',
        'Reportes DGII (606, 607, 608, 609)',
        'Registro de actividad',
      ],
    },
  },
  {
    key:         'pro',
    name:        'Pro',
    price:       65,
    priceEnvKey: 'STRIPE_PRICE_PRO',
    limits: {
      docs:      -1,   // ilimitado
      users:     -1,   // ilimitado
      trialDocs: 30,
    },
    features: [
      'clientes',
      'productos',
      'cotizaciones',
      'facturas-recurrentes',
      'inventario-avanzado',
      'reportes',
      'actividad',
      'api-keys',
      'webhooks',
      'impresoras',
    ],
    ui: {
      description:       'Para empresas con alto volumen',
      badgeColor:        'bg-purple-50 text-purple-700 border-purple-200',
      highlighted:       false,
      marketingFeatures: [
        'Comprobantes ilimitados',
        'Usuarios ilimitados',
        'Todo lo de Business +',
        'API REST',
        'Webhooks',
        'Integración con impresoras fiscales',
        'Soporte prioritario',
      ],
    },
  },
];

// ─── Plan sin suscripción ─────────────────────────────────────────────────────
// Usado internamente cuando no hay plan activo (no aparece en pricing page)

export const FREE_PLAN: PlanDef = {
  key:         'free',
  name:        'Gratis',
  price:       0,
  priceEnvKey: '',
  limits: { docs: 0, users: 0, trialDocs: 0 },
  features:    [],
  ui: {
    description:       'Sin plan activo',
    badgeColor:        'bg-gray-100 text-gray-600 border-gray-200',
    highlighted:       false,
    marketingFeatures: [],
  },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Obtiene la definición de un plan por su clave (case-insensitive). */
export function getPlan(key: string | null | undefined): PlanDef {
  const k = (key ?? '').toLowerCase();
  return PLANS.find(p => p.key === k) ?? FREE_PLAN;
}

/**
 * Obtiene un plan a partir de su Stripe Price ID.
 * Solo funciona server-side (lee process.env).
 */
export function getPlanByPriceId(priceId: string): PlanDef {
  if (!priceId) return FREE_PLAN;
  const match = PLANS.find(p => p.priceEnvKey && process.env[p.priceEnvKey] === priceId);
  return match ?? FREE_PLAN;
}

/** Busca un plan por su nombre display (lo que devuelve Stripe / está en la BD). */
export function getPlanByName(name: string | null | undefined): PlanDef {
  return getPlan(name); // name y key son iguales en lowercase
}

/** ¿El plan tiene acceso a esta feature? */
export function planHasFeature(
  planKey: string | null | undefined,
  feature: Feature,
): boolean {
  return getPlan(planKey).features.includes(feature);
}

/**
 * Límite de comprobantes/mes para un plan.
 * @param planKey  - Clave del plan (e.g. 'starter')
 * @param trialing - Si true, devuelve el límite de trial
 * @returns Número de docs permitidos. -1 = ilimitado, 0 = sin acceso.
 */
export function getPlanDocLimit(
  planKey: string | null | undefined,
  trialing = false,
): number {
  const plan = getPlan(planKey);
  if (trialing) return plan.limits.trialDocs;
  return plan.limits.docs;
}

/**
 * Límite de usuarios/miembros del equipo para un plan.
 * @returns -1 = ilimitado, 0 = sin acceso, >0 = límite exacto
 */
export function getPlanUserLimit(planKey: string | null | undefined): number {
  return getPlan(planKey).limits.users;
}

/**
 * Price ID de Stripe para un plan.
 * Solo funciona server-side.
 */
export function getPlanPriceId(planKey: string): string {
  const plan = PLANS.find(p => p.key === planKey);
  if (!plan?.priceEnvKey) return '';
  return process.env[plan.priceEnvKey] ?? '';
}

/** Precio formateado para mostrar en UI (ej: "$15 USD/mes") */
export function getPlanPriceLabel(planKey: string): string {
  const plan = getPlan(planKey);
  if (plan.price === 0) return 'Gratis';
  return `$${plan.price} USD/mes`;
}
