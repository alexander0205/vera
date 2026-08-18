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

import { BILLING_ENABLED } from '@/lib/config/billing';
import { MODULES_BASE, type ModuleKey } from '@/lib/config/modules';

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
  | 'inventario-avanzado'    // almacenes, categorías, listas de precios, vendedores
  | 'reportes'
  | 'actividad'
  | 'contabilidad-avanzada'  // libro diario, mayor, balances, activos fijos, cierre
  | 'roles-usuarios'         // roles a medida y permisos por usuario
  | 'caja'                   // turnos, cuadre y cierre de caja
  | 'impresoras';

export interface PlanLimits {
  /** Comprobantes electrónicos por mes. -1 = ilimitado */
  docs: number;
  /** Miembros del equipo. -1 = ilimitado, 0 = sin acceso */
  users: number;
  /** Comprobantes durante el período de prueba (trial) */
  trialDocs: number;
  /**
   * Tope de estudiantes del tramo escolar. -1 = no aplica (planes de e-CF).
   * Es la dimensión POR LA QUE SE COBRA el módulo colegio: el tramo se elige
   * por cuántos estudiantes tiene el colegio, no por consumo.
   */
  estudiantes: number;
  /** Avisos de WhatsApp a padres por mes. -1 = no aplica. */
  whatsappMensajes: number;
  /**
   * Avisos por SMS al mes. -1 = no aplica.
   *
   * El modelo comercial solo puso número al WhatsApp, pero el SMS también se
   * paga por unidad —y más caro— así que sin tope un colegio con los tres
   * canales encendidos nos deja una factura abierta. Va igualado al de
   * WhatsApp: es el mismo recordatorio por otra vía, y el volumen que el
   * modelo consideró razonable es ese. Si se decide otro número, se cambia
   * aquí y el sistema entero lo respeta.
   */
  smsMensajes: number;
}

/**
 * Dos líneas de producto que NO se mezclan: un negocio cualquiera compra
 * `ecf`; un colegio compra `colegio`, que ya incluye la facturación completa.
 */
export type FamiliaPlan = 'ecf' | 'colegio';

export interface PlanDef {
  /** Clave interna (lowercase). Es lo que se guarda en teams.plan_name (lowercase). */
  key: string;
  /** A qué línea de producto pertenece. */
  familia: FamiliaPlan;
  /** Nombre de display. Debe coincidir con lo que envía Stripe en el webhook. */
  name: string;
  /** Precio en USD/mes (0 para planes gratuitos/sin plan) */
  price: number;
  /** Nombre de la variable de entorno con el Price ID de Stripe */
  priceEnvKey: string;
  limits: PlanLimits;
  /**
   * Módulos que incluye el plan (teams.modulos_habilitados).
   *
   * NO es lo mismo que `features`: una feature es una sección DENTRO de
   * Facturación (cotizaciones, inventario…); un módulo es un espacio propio
   * con su nav y su gate — Facturación, POS, Escolar, Administración.
   *
   * Los tramos de colegio traen POS porque la cafetería del colegio ES un
   * punto de venta: Andrés Bello ya vende ahí con su "Almacén de cafetería".
   */
  modulos: ModuleKey[];
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
  // ── Línea 1 · Facturación Electrónica e-CF ─────────────────────────────────
  // Posicionada entre el facturador gratuito de la DGII (150 e-CF/mes, sin
  // multiusuario) y Alegra Premium (~US$60/mes).
  {
    key: 'emprendedor', familia: 'ecf',
    modulos: [...MODULES_BASE],
    name: 'Emprendedor', price: 9, priceEnvKey: 'STRIPE_PRICE_EMPRENDEDOR',
    limits: { docs: 50, users: 1, trialDocs: -1, estudiantes: -1, whatsappMensajes: -1, smsMensajes: -1 },
    features: ['contabilidad-avanzada', 'clientes', 'productos', 'cotizaciones', 'reportes', 'roles-usuarios', 'caja', 'facturas-recurrentes', 'inventario-avanzado', 'actividad', 'impresoras'],
    ui: {
      description: 'Para quien está empezando a facturar',
      badgeColor: 'bg-gray-100 text-gray-700 border-gray-200',
      highlighted: false,
      marketingFeatures: ['50 comprobantes e-CF al mes', '1 usuario', 'Sistema completo: contabilidad, inventario, caja y reportes 606/607'],
    },
  },
  {
    key: 'negocio', familia: 'ecf',
    modulos: [...MODULES_BASE],
    name: 'Negocio', price: 19, priceEnvKey: 'STRIPE_PRICE_NEGOCIO',
    limits: { docs: 200, users: 3, trialDocs: -1, estudiantes: -1, whatsappMensajes: -1, smsMensajes: -1 },
    features: ['contabilidad-avanzada', 'clientes', 'productos', 'cotizaciones', 'reportes', 'roles-usuarios', 'caja', 'facturas-recurrentes', 'inventario-avanzado', 'actividad', 'impresoras'],
    ui: {
      description: 'Para el negocio en crecimiento',
      badgeColor: 'bg-blue-50 text-blue-700 border-blue-200',
      highlighted: true,
      marketingFeatures: ['200 comprobantes e-CF al mes', '3 usuarios', 'Sistema completo: contabilidad, inventario, caja y reportes 606/607'],
    },
  },
  {
    key: 'pro', familia: 'ecf',
    modulos: [...MODULES_BASE],
    name: 'Pro', price: 35, priceEnvKey: 'STRIPE_PRICE_PRO',
    limits: { docs: 500, users: 5, trialDocs: -1, estudiantes: -1, whatsappMensajes: -1, smsMensajes: -1 },
    features: ['contabilidad-avanzada', 'clientes', 'productos', 'cotizaciones', 'reportes', 'roles-usuarios', 'caja', 'facturas-recurrentes', 'inventario-avanzado', 'actividad', 'impresoras'],
    ui: {
      description: 'Para el negocio consolidado',
      badgeColor: 'bg-purple-50 text-purple-700 border-purple-200',
      highlighted: false,
      marketingFeatures: ['500 comprobantes e-CF al mes', '5 usuarios', 'Sistema completo: contabilidad, inventario, caja y reportes 606/607'],
    },
  },
  {
    key: 'ilimitado', familia: 'ecf',
    modulos: [...MODULES_BASE],
    // «Multi-sucursal» prometía gestión de sucursales, que el sistema NO tiene:
    // `sucursal` es un texto que se le pone a una secuencia y sale impreso en
    // la factura, nada más. Lo que de verdad distingue a este plan es ser el
    // único sin tope de comprobantes, y así el nombre concuerda con el ∞ que
    // la página de precios ya pinta en su fila.
    name: 'Ilimitado', price: 65, priceEnvKey: 'STRIPE_PRICE_ILIMITADO',
    limits: { docs: -1, users: 8, trialDocs: -1, estudiantes: -1, whatsappMensajes: -1, smsMensajes: -1 },
    features: ['contabilidad-avanzada', 'clientes', 'productos', 'cotizaciones', 'reportes', 'roles-usuarios', 'caja', 'facturas-recurrentes', 'inventario-avanzado', 'actividad', 'impresoras'],
    ui: {
      description: 'Sin tope de comprobantes, para cuando facturar mucho es lo normal',
      badgeColor: 'bg-teal-50 text-teal-700 border-teal-200',
      highlighted: false,
      marketingFeatures: ['Comprobantes e-CF ilimitados', '8 usuarios', 'Sistema completo: contabilidad, inventario, caja y reportes 606/607'],
    },
  },

  // ── Línea 2 · Facturación + Módulo Colegio ─────────────────────────────────
  // Se cobra POR TRAMO DE ESTUDIANTES, no por consumo. Los cuatro llevan
  // e-CF ILIMITADO: un colegio de 441 alumnos emite ~1,000 comprobantes en el
  // mes de inscripción, así que cualquier tope lo dejaría sin facturar.
  //
  // `estudiantes` es el techo del tramo — 100, 225, 400, 650 — y de ahí sale
  // todo lo demás: los avisos de WhatsApp son TRES POR ESTUDIANTE AL MES
  // (la factura, el recordatorio y el vencido), así que 300 = 3×100 y
  // 1,950 = 3×650. Si un día se mueve un tramo hay que mover su cuota de
  // avisos con él, o el colegio del techo se queda sin mensajes a mitad de
  // mes — y esos sí cuestan dinero.
  //
  // Antes los topes eran 150/300/500/800 mientras los avisos seguían
  // calculados sobre 100/225/400/650: el colegio que llenaba su tramo
  // recibía 2 avisos por estudiante en vez de 3.
  {
    key: 'colegio-basico', familia: 'colegio',
    modulos: [...MODULES_BASE, 'escolar', 'pos'],
    name: 'Básico', price: 135, priceEnvKey: 'STRIPE_PRICE_COLEGIO_BASICO',
    limits: { docs: -1, users: 2, trialDocs: -1, estudiantes: 100, whatsappMensajes: 300, smsMensajes: 300 },
    features: ['contabilidad-avanzada', 'clientes', 'productos', 'cotizaciones', 'reportes', 'roles-usuarios', 'caja', 'facturas-recurrentes', 'inventario-avanzado', 'actividad', 'impresoras'],
    ui: {
      description: 'Hasta 100 estudiantes',
      badgeColor: 'bg-gray-100 text-gray-700 border-gray-200',
      highlighted: false,
      marketingFeatures: ['Hasta 100 estudiantes', 'e-CF ilimitados', '2 usuarios', '300 avisos WhatsApp/mes', 'Recordatorios automáticos por WhatsApp, SMS y correo', '8 horas de implementación'],
    },
  },
  {
    key: 'colegio-intermedio', familia: 'colegio',
    modulos: [...MODULES_BASE, 'escolar', 'pos'],
    name: 'Intermedio', price: 237, priceEnvKey: 'STRIPE_PRICE_COLEGIO_INTERMEDIO',
    limits: { docs: -1, users: 3, trialDocs: -1, estudiantes: 225, whatsappMensajes: 675, smsMensajes: 675 },
    features: ['contabilidad-avanzada', 'clientes', 'productos', 'cotizaciones', 'reportes', 'roles-usuarios', 'caja', 'facturas-recurrentes', 'inventario-avanzado', 'actividad', 'impresoras'],
    ui: {
      description: 'De 101 a 225 estudiantes',
      badgeColor: 'bg-blue-50 text-blue-700 border-blue-200',
      highlighted: true,
      marketingFeatures: ['Hasta 225 estudiantes', 'e-CF ilimitados', '3 usuarios', '675 avisos WhatsApp/mes', 'Recordatorios automáticos por WhatsApp, SMS y correo', '10.5 horas de implementación'],
    },
  },
  {
    key: 'colegio-avanzado', familia: 'colegio',
    modulos: [...MODULES_BASE, 'escolar', 'pos'],
    name: 'Avanzado', price: 350, priceEnvKey: 'STRIPE_PRICE_COLEGIO_AVANZADO',
    limits: { docs: -1, users: 5, trialDocs: -1, estudiantes: 400, whatsappMensajes: 1200, smsMensajes: 1200 },
    features: ['contabilidad-avanzada', 'clientes', 'productos', 'cotizaciones', 'reportes', 'roles-usuarios', 'caja', 'facturas-recurrentes', 'inventario-avanzado', 'actividad', 'impresoras'],
    ui: {
      description: 'De 226 a 400 estudiantes',
      badgeColor: 'bg-purple-50 text-purple-700 border-purple-200',
      highlighted: false,
      marketingFeatures: ['Hasta 400 estudiantes', 'e-CF ilimitados', '5 usuarios', '1,200 avisos WhatsApp/mes', 'Recordatorios automáticos por WhatsApp, SMS y correo', '14 horas de implementación'],
    },
  },
  {
    key: 'colegio-institucional', familia: 'colegio',
    modulos: [...MODULES_BASE, 'escolar', 'pos'],
    name: 'Institucional', price: 500, priceEnvKey: 'STRIPE_PRICE_COLEGIO_INSTITUCIONAL',
    limits: { docs: -1, users: 9, trialDocs: -1, estudiantes: 650, whatsappMensajes: 1950, smsMensajes: 1950 },
    features: ['contabilidad-avanzada', 'clientes', 'productos', 'cotizaciones', 'reportes', 'roles-usuarios', 'caja', 'facturas-recurrentes', 'inventario-avanzado', 'actividad', 'impresoras'],
    ui: {
      description: 'De 401 a 650 estudiantes',
      badgeColor: 'bg-teal-50 text-teal-700 border-teal-200',
      highlighted: false,
      marketingFeatures: ['Hasta 650 estudiantes', 'e-CF ilimitados', '9 usuarios', '1,950 avisos WhatsApp/mes', 'Recordatorios automáticos por WhatsApp, SMS y correo', '19 horas de implementación'],
    },
  },
];

// ─── Plan sin suscripción ─────────────────────────────────────────────────────
// Usado internamente cuando no hay plan activo (no aparece en pricing page)

export const FREE_PLAN: PlanDef = {
  key:         'free',
  familia:     'ecf',
  modulos:     [...MODULES_BASE],
  name:        'Gratis',
  price:       0,
  priceEnvKey: '',
  // users: 1 → el propietario. Sin plan activo el negocio existe pero no puede
  // invitar a nadie más (antes 0 hacía que el contador mostrara "1/0 usuarios").
  limits: { docs: 0, users: 1, trialDocs: 0, estudiantes: -1, whatsappMensajes: -1, smsMensajes: -1 },
  features:    [],
  ui: {
    description:       'Sin plan activo',
    badgeColor:        'bg-gray-100 text-gray-600 border-gray-200',
    highlighted:       false,
    marketingFeatures: [],
  },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Definición de un plan por su clave o por su nombre (case-insensitive).
 *
 * Acepta las dos formas a propósito. Lo correcto es guardar la CLAVE en
 * `teams.plan_name`, y eso hace ahora todo el código; pero durante un tiempo
 * el checkout y el webhook guardaron el NOMBRE, y ahí se caían cinco de los
 * ocho planes: «Ilimitado» no es la clave `ilimitado` si lo que se guardó fue
 * «Multi-sucursal», y «Avanzado» no es `colegio-avanzado`. Sin coincidencia,
 * esta función devolvía FREE_PLAN —cero comprobantes, sin módulos, solo
 * lectura— a un colegio que acababa de pagar US$350.
 *
 * Buscar también por nombre repara esas filas sin migración y sin que nadie
 * se quede fuera mientras tanto.
 */

/**
 * Claves que un plan tuvo antes y que siguen apareciendo en datos viejos.
 *
 * `multisucursal` se renombró a `ilimitado` cuando se vio que el nombre
 * prometía una gestión de sucursales que el sistema no tiene. Renombrar una
 * clave es peligroso justo por esto: vive en `teams.plan_name` de empresas
 * reales y en la metadata de Stripe, y el código se despliega antes de que los
 * datos cambien. Sin este mapa, entre un despliegue y el UPDATE habría una
 * ventana en la que `getPlan('multisucursal')` no encuentra nada, cae a
 * FREE_PLAN y deja a todo el mundo con cero comprobantes.
 *
 * No se quita cuando los datos se migren. Cuesta una línea y cubre lo que no
 * controlamos: una suscripción de Stripe con la clave vieja en su metadata, un
 * respaldo que se restaure, una fila que se creara mientras tanto.
 */
const CLAVES_ANTIGUAS: Record<string, string> = {
  multisucursal: 'ilimitado',
};

export function getPlan(key: string | null | undefined): PlanDef {
  const bruta = (key ?? '').trim().toLowerCase();
  if (!bruta) return FREE_PLAN;
  const k = CLAVES_ANTIGUAS[bruta] ?? bruta;
  return PLANS.find(p => p.key === k)
    ?? PLANS.find(p => p.name.toLowerCase() === k)
    ?? FREE_PLAN;
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
 * @param planKey  - Clave del plan (e.g. 'negocio')
 * @param trialing - Si true, devuelve el límite de trial
 * @returns Número de docs permitidos. -1 = ilimitado, 0 = sin acceso.
 */
export function getPlanDocLimit(
  planKey: string | null | undefined,
  trialing = false,
): number {
  // Producto en desarrollo: sin billing no se le cobra ni se le limita a nadie.
  // Ver lib/config/billing. Punto único: cubre la emisión de e-CF y la UI.
  if (!BILLING_ENABLED) return -1;
  const plan = getPlan(planKey);
  if (trialing) return plan.limits.trialDocs;
  return plan.limits.docs;
}

/**
 * Límite de usuarios/miembros del equipo para un plan.
 * @returns -1 = ilimitado, 0 = sin acceso, >0 = límite exacto
 */
export function getPlanUserLimit(planKey: string | null | undefined): number {
  if (!BILLING_ENABLED) return -1;
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

/**
 * Un tope, en palabras. Vive junto al catálogo porque la convención `-1 =
 * ilimitado` es suya: cada pantalla que la traduzca por su cuenta es una
 * pantalla que un día enseña «-1 usuarios».
 */
export function limiteTexto(n: number): string {
  return n < 0 ? 'ilimitados' : n.toLocaleString('es-DO');
}

/** Precio formateado para mostrar en UI (ej: "$15 USD/mes") */
export function getPlanPriceLabel(planKey: string): string {
  const plan = getPlan(planKey);
  if (plan.price === 0) return 'Gratis';
  return `$${plan.price} USD/mes`;
}

// ─── Familias y tramos ────────────────────────────────────────────────────────

/** Planes de una línea de producto, en orden de precio. */
export function planesDeFamilia(familia: FamiliaPlan): PlanDef[] {
  return PLANS.filter(p => p.familia === familia);
}

/**
 * ¿Puede saltar de familia por autoservicio, y hacia dónde?
 *
 * `CAMBIO_PLAN.permiteCambiarDeFamilia` estaba en `false` y cerraba las dos
 * direcciones. El motivo era bueno pero solo vale para UNA:
 *
 *   colegio → e-CF   pierde el módulo escolar CON LOS ESTUDIANTES DENTRO.
 *                    Eso no se hace con un botón; se habla.
 *   e-CF → colegio   gana el módulo escolar y el POS. No pierde nada.
 *
 * Cerrando las dos, un comercio que abre un colegio no tenía forma de
 * contratarlo desde su propia pantalla de suscripción: veía cuatro planes de
 * facturación y ninguna señal de que la línea de colegios existe. Perder una
 * venta por proteger un caso que no es el suyo.
 *
 * Devuelve las familias que se le pueden OFRECER además de la suya.
 */
export function familiasOfrecibles(desde: FamiliaPlan): FamiliaPlan[] {
  return desde === 'ecf' ? ['colegio'] : [];
}

/**
 * Tramo escolar que le toca a un colegio por su cantidad de estudiantes.
 *
 * Devuelve null si se pasa del tope del tramo más alto (650): ahí no hay plan
 * de catálogo y toca cotizar a mano. Es mejor que caerse al tramo más caro
 * calladamente y cobrar de menos.
 */
export function tramoPorEstudiantes(estudiantes: number): PlanDef | null {
  return planesDeFamilia('colegio')
    .find(p => estudiantes <= p.limits.estudiantes) ?? null;
}

/** Tope de estudiantes del plan. -1 = no aplica (planes de e-CF). */
export function getPlanEstudiantesLimit(planKey: string | null | undefined): number {
  if (!BILLING_ENABLED) return -1;
  return getPlan(planKey).limits.estudiantes;
}

/** Tope de avisos de WhatsApp al mes. -1 = no aplica / ilimitado. */
export function getPlanWhatsappLimit(planKey: string | null | undefined): number {
  if (!BILLING_ENABLED) return -1;
  return getPlan(planKey).limits.whatsappMensajes;
}

/**
 * ¿Se puede agregar UN usuario más?
 *
 * Regla del negocio: quien YA está por encima del tope se queda —no se expulsa
 * a nadie por un cambio de plan— pero no puede seguir agregando. Por eso la
 * pregunta es "¿puedo sumar uno?" y no "¿estoy dentro del límite?": los dos
 * colegios grandes tienen 7 usuarios contra topes de 3 y 5, y con la segunda
 * pregunta habría que sacarles gente.
 */
export function puedeAgregarUsuario(
  planKey: string | null | undefined,
  usuariosActuales: number,
): { permitido: boolean; limite: number; motivo?: string } {
  const limite = getPlanUserLimit(planKey);
  if (limite === -1) return { permitido: true, limite };
  if (usuariosActuales < limite) return { permitido: true, limite };
  const plan = getPlan(planKey);
  return {
    permitido: false,
    limite,
    motivo: usuariosActuales > limite
      ? `Tu plan ${plan.name} incluye ${limite} usuarios y ya tienes ${usuariosActuales}. Puedes conservar los que están, pero para agregar más necesitas un plan mayor.`
      : `Tu plan ${plan.name} incluye ${limite} usuarios y ya los estás usando todos.`,
  };
}

/**
 * Módulos que le corresponden a un team por su plan.
 *
 * Con billing apagado devuelve null: los módulos los administramos a mano
 * desde /admin y ninguna suscripción debe opinar. Esto es lo que impide que
 * un webhook le apague el POS a un colegio al que se lo habilitamos nosotros.
 */
export function modulosDelPlan(
  planKey: string | null | undefined,
  addonsActivos: string[] = [],
): ModuleKey[] | null {
  if (!BILLING_ENABLED) return null;
  const delPlan = getPlan(planKey).modulos;
  const delAddon = ADDONS.filter(a => addonsActivos.includes(a.key)).map(a => a.modulo);
  return [...new Set<ModuleKey>([...delPlan, ...delAddon])];
}

// ─── Adicionales (add-ons) ────────────────────────────────────────────────────

export interface AddonDef {
  key: string;
  /** Módulo que desbloquea al contratarlo. */
  modulo: ModuleKey;
  name: string;
  /** USD/mes que se SUMAN al precio del plan. */
  price: number;
  /** Variable con el Price ID de Stripe. Reusa el nombre que ya existía en
   *  lib/payments/modulos.ts para no tener dos nombres del mismo precio. */
  priceEnvKey: string;
  /** Familias donde ya viene incluido: ahí no se ofrece ni se cobra aparte. */
  incluidoEn: FamiliaPlan[];
  descripcion: string;
}

/**
 * Un adicional es un módulo que se contrata SUELTO sobre cualquier plan de la
 * familia e-CF. En los tramos de colegio el POS ya viene dentro (la cafetería),
 * así que ahí no se ofrece — cobrarlo dos veces sería el error obvio.
 */
export const ADDONS: AddonDef[] = [
  {
    key: 'pos',
    modulo: 'pos',
    name: 'Punto de Venta',
    price: 9,
    priceEnvKey: 'STRIPE_PRICE_MODULO_POS',
    incluidoEn: ['colegio'],
    descripcion: 'Caja registradora, turnos e inventario por almacén.',
  },
];

/** Adicionales que TIENE SENTIDO ofrecerle a este plan (los no incluidos ya). */
export function addonsDisponibles(planKey: string | null | undefined): AddonDef[] {
  const plan = getPlan(planKey);
  return ADDONS.filter(a => !a.incluidoEn.includes(plan.familia) && !plan.modulos.includes(a.modulo));
}

/** ¿Este plan ya trae el adicional sin cargo? */
export function addonIncluido(planKey: string | null | undefined, addonKey: string): boolean {
  const plan = getPlan(planKey);
  const addon = ADDONS.find(a => a.key === addonKey);
  if (!addon) return false;
  return addon.incluidoEn.includes(plan.familia) || plan.modulos.includes(addon.modulo);
}

/** Total mensual: plan + adicionales contratados (los incluidos no suman). */
export function precioTotal(planKey: string | null | undefined, addonsActivos: string[] = []): number {
  const plan = getPlan(planKey);
  const extra = ADDONS
    .filter(a => addonsActivos.includes(a.key) && !addonIncluido(planKey, a.key))
    .reduce((s, a) => s + a.price, 0);
  return plan.price + extra;
}

// ─── Líneas comerciales ───────────────────────────────────────────────────────

/**
 * Cómo se le presentan los planes al cliente: tres líneas, no dos.
 *
 * "Zero POS + ERP" NO es una familia aparte en los datos — es la misma familia
 * `ecf` con el adicional de POS ya sumado. Se modela así a propósito: duplicar
 * los cuatro planes solo para mostrarlos con POS obligaría a mantener los
 * precios en dos sitios, y el día que suba el Pro habría que acordarse de los
 * dos. Aquí el precio se calcula.
 */
export interface LineaProducto {
  key: string;
  nombre: string;
  descripcion: string;
  familia: FamiliaPlan;
  /** Adicionales que la línea trae de fábrica (se suman al precio). */
  addons: string[];
  /**
   * La frase que va primero, en grande: el problema que se le quita de encima.
   *
   * Deliberadamente SIN porcentajes ni cifras. «Los colegios pierden un 30%»
   * sin fuente es la clase de dato que el cliente no se cree, y si se lo cree
   * y luego no le cuadra, nos lo reclama. Nombrar POR DÓNDE se va el dinero es
   * más específico que cualquier número inventado.
   */
  gancho: string;
  /**
   * Lo que la línea le RESUELVE al cliente, en su idioma.
   *
   * No confundir con `PlanDef.limits`, que son topes («hasta 300
   * estudiantes», «3 usuarios»): eso es una ficha técnica y no le dice a nadie
   * por qué debería pagar. Aquí van los trabajos que deja de hacer a mano.
   *
   * Regla al escribir esto: solo lo que el sistema HACE de verdad. Una
   * promesa de más aquí es una decepción en la segunda semana y una baja en
   * la cuarta.
   */
  vende: string[];
}

export const LINEAS_PRODUCTO: LineaProducto[] = [
  {
    key: 'erp',
    nombre: 'Zero ERP',
    descripcion: 'Facturación electrónica, contabilidad completa, inventario y compras.',
    familia: 'ecf',
    addons: [],
    gancho: 'Deja de perseguir lo que te deben y de armar los 606 a mano.',
    vende: [
      'Emites e-CF ante la DGII sin salir del sistema ni pagar un tercero',
      'Sabes al instante quién te debe, cuánto y desde cuándo',
      'Contabilidad, inventario y compras en el mismo sitio, cuadrando solos',
      'Los reportes 606 y 607 salen armados, no se arman a mano',
    ],
  },
  {
    key: 'pos-erp',
    nombre: 'Zero POS + ERP',
    descripcion: 'Todo el ERP más el punto de venta: caja, turnos y stock por almacén.',
    familia: 'ecf',
    addons: ['pos'],
    gancho: 'Lo que se vende, se descuenta del inventario y se factura en el mismo acto.',
    vende: [
      'Cobras en mostrador con caja, turnos y cuadre al cerrar',
      'El inventario baja solo con cada venta, por almacén',
      'La factura con su comprobante fiscal sale al cobrar, sin un segundo paso',
      'Y detrás, el ERP completo: contabilidad, compras y cuentas por cobrar',
    ],
  },
  {
    key: 'erp-colegio',
    nombre: 'Zero ERP Colegio',
    descripcion: 'Todo el ERP, el punto de venta de la cafetería y la gobernanza del colegio.',
    familia: 'colegio',
    addons: [],
    // Un colegio no pierde plata de golpe: la pierde en goteo, y las tres vías
    // por las que se va son exactamente las tres que el sistema cierra. Por eso
    // el texto empieza por el dinero y no por las funciones — el director no
    // compra «gestión de matrículas», compra dejar de perder lo que ya trabajó.
    gancho: 'Un colegio no pierde el dinero de golpe: se le va en cuotas que nadie reclamó y en moras que nunca se aplicaron.',
    vende: [
      'La mora se aplica sola el día que vence, en vez de perderse por no acordarse de cobrarla',
      'Nadie deja de pagar por olvido: el aviso sale por WhatsApp, SMS y correo antes de vencer, el día del vencimiento y antes del recargo',
      'Sabes en todo momento quién debe, cuánto y desde cuándo, sin armar la hoja aparte',
      'Cada mensualidad se factura sola, con su comprobante fiscal ante la DGII',
    ],
  },
];

// ─── Color del plan en la UI ──────────────────────────────────────────────────

/**
 * El tono del chip de un plan, DERIVADO de su escalón dentro de su familia.
 *
 * Antes cada pantalla tenía su propio `if (plan === 'business')`, y cuando el
 * catálogo cambió esas listas se quedaron atrás: los chips de plan se pintaron
 * grises durante meses porque ningún plan real se llamaba ya así. Calculado
 * desde PLANS no puede desincronizarse.
 */
const TONOS_MUI = ['info', 'primary', 'secondary', 'success'] as const;
export type TonoPlan = (typeof TONOS_MUI)[number] | 'default';

export function planColorMui(planKey: string | null | undefined): TonoPlan {
  const plan = getPlan(planKey);
  if (plan.key === 'free') return 'default';
  const i = planesDeFamilia(plan.familia).findIndex(p => p.key === plan.key);
  return i < 0 ? 'default' : TONOS_MUI[Math.min(i, TONOS_MUI.length - 1)];
}

/** Colores del chip en hex, para las pantallas que no usan la paleta de MUI. */
const CHIP_HEX = [
  { bgcolor: '#eff6ff', color: '#1d4ed8', border: '#bfdbfe' }, // escalón 1
  { bgcolor: '#eef2fe', color: '#2a45c4', border: '#c7d2fc' }, // 2 — marca
  { bgcolor: '#faf5ff', color: '#7c3aed', border: '#ddd6fe' }, // 3
  { bgcolor: '#ecfdf5', color: '#047857', border: '#a7f3d0' }, // 4
] as const;

export function planChipColors(planKey: string | null | undefined) {
  const plan = getPlan(planKey);
  const gris = { bgcolor: '#f3f4f6', color: '#374151', border: '#e5e7eb' };
  if (plan.key === 'free') return gris;
  const i = planesDeFamilia(plan.familia).findIndex(p => p.key === plan.key);
  return i < 0 ? gris : CHIP_HEX[Math.min(i, CHIP_HEX.length - 1)];
}

/** Planes de una línea, con el precio que de verdad paga el cliente. */
export function planesDeLinea(lineaKey: string): { plan: PlanDef; precio: number }[] {
  const linea = LINEAS_PRODUCTO.find(l => l.key === lineaKey);
  if (!linea) return [];
  return planesDeFamilia(linea.familia).map(plan => ({
    plan,
    precio: precioTotal(plan.key, linea.addons),
  }));
}
