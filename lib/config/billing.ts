/**
 * Interruptor central de la UI de planes/suscripción.
 *
 * Mientras el producto está en desarrollo NO se le muestra al usuario nada de
 * planes, precios ni suscripciones: los módulos y los límites los administramos
 * nosotros desde el panel admin (/admin/empresas/[id]). Con esto apagado:
 *
 *  - /pricing, /dashboard/suscripcion y /cuenta/plan devuelven 404
 *  - desaparecen los enlaces a esas páginas de navs, dropdowns y búsqueda
 *  - no se aplica el límite mensual de comprobantes por plan
 *  - no se aplica el límite de usuarios por plan
 *  - no se bloquea la navegación por "empresa sin plan activo"
 *
 * El código de billing (Stripe, PLANS, webhooks) queda intacto: esto solo
 * decide si se le presenta al usuario. Para reactivarlo, poner
 * NEXT_PUBLIC_BILLING_ENABLED=true — no hay que revertir nada.
 *
 * Client-safe: el process.env va literal para que Next lo inlinee en el bundle.
 */
export const BILLING_ENABLED = process.env.NEXT_PUBLIC_BILLING_ENABLED === 'true';
