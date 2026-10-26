/**
 * Lo que un correo de suscripción necesita saber, sacado de Stripe.
 *
 * Todo aquí es PURO: recibe los objetos que Stripe ya devolvió (la suscripción,
 * la factura, el método de pago) y devuelve texto, fechas o decisiones. Nada
 * llama a Stripe ni a la base — eso vive en `avisos.ts`. La separación no es
 * por gusto: un correo de cobro que dice el monto equivocado, o que sale dos
 * veces, es de las pocas cosas que un cliente NO perdona, y lo único que las
 * impide es poder probar cada decisión sin montar una suscripción de verdad.
 *
 * Client-safe: no importa nada del servidor.
 */

import type Stripe from 'stripe';
import { fechaRD } from '@/lib/utils/format';

const TZ_RD = 'America/Santo_Domingo';
const DIA_MS = 86_400_000;

// ─── Dinero ───────────────────────────────────────────────────────────────────

const SIMBOLO: Record<string, string> = { usd: 'US$', dop: 'RD$' };

/**
 * `13500, 'usd'` → «US$135»; `1950, 'usd'` → «US$19.50»; `1250075, 'dop'` →
 * «RD$12,500.75».
 *
 * Sin decimales cuando el monto es redondo: «US$135.00» en un correo parece
 * un cálculo, «US$135» parece un precio. Los centavos se manejan como enteros
 * para no arrastrar el error de punto flotante a una cifra que el cliente va a
 * comparar con su estado de cuenta.
 *
 * Una moneda que no conocemos sale con su código («EUR 10»): mejor un código
 * feo que un «US$» falso.
 */
export function formatearMonto(centavos: number, moneda: string): string {
  const codigo = (moneda ?? '').toLowerCase();
  const simbolo = SIMBOLO[codigo] ?? `${codigo.toUpperCase()} `;

  const total = Math.round(centavos);
  const signo = total < 0 ? '-' : '';
  const abs = Math.abs(total);
  const enteros = Math.floor(abs / 100).toLocaleString('en-US');
  const resto = abs % 100;

  return `${signo}${simbolo}${enteros}${resto ? `.${String(resto).padStart(2, '0')}` : ''}`;
}

/**
 * «al mes», «al año»… para pegar detrás de un monto. Si el cobro no es cada
 * unidad sino cada varias («cada 3 meses») lo dice así. Intervalo desconocido
 * → '' para que la frase siga siendo gramatical sin él.
 */
export function periodicidad(
  intervalo: string | null | undefined,
  cada: number | null | undefined = 1,
): string {
  const n = cada && cada > 0 ? cada : 1;
  const singular: Record<string, string> = {
    day: 'al día', week: 'a la semana', month: 'al mes', year: 'al año',
  };
  const plural: Record<string, string> = {
    day: 'días', week: 'semanas', month: 'meses', year: 'años',
  };
  if (!intervalo || !singular[intervalo]) return '';
  return n === 1 ? singular[intervalo] : `cada ${n} ${plural[intervalo]}`;
}

/** Lo mínimo que se lee de un item de suscripción. Stripe.SubscriptionItem lo cumple. */
export interface ItemDePrecio {
  quantity?: number | null;
  current_period_end?: number | null;
  price?: {
    unit_amount?: number | null;
    unit_amount_decimal?: string | null;
    currency?: string | null;
    recurring?: { interval?: string | null; interval_count?: number | null } | null;
  } | null;
}

export interface PrecioDeSuscripcion {
  /** Lo que cuesta cada ciclo, en centavos. null si no se pudo saber (precio escalonado). */
  centavos: number | null;
  moneda: string;
  intervalo: string | null;
  cada: number;
}

/**
 * Cuánto cuesta la suscripción por ciclo.
 *
 * SUMA todos los items: «Zero POS + ERP» son dos precios de Stripe en la misma
 * suscripción (el plan y el adicional) y el cliente ve —y paga— la suma. Tomar
 * solo el primero diría US$19 a quien paga US$28.
 *
 * Es el precio de LISTA: no aplica cupones ni impuestos, que solo Stripe sabe
 * al emitir la factura. Si algún item no tiene monto fijo (precio escalonado),
 * el total se declara desconocido (`centavos: null`) antes que inventar uno.
 */
export function precioDeSuscripcion(
  sub: { items: { data: ItemDePrecio[] } },
): PrecioDeSuscripcion | null {
  const items = sub.items?.data ?? [];
  const primero = items[0]?.price;
  if (!primero) return null;

  let total = 0;
  let conocido = true;
  for (const item of items) {
    const p = item.price;
    const unidad = p?.unit_amount
      ?? (p?.unit_amount_decimal != null ? Math.round(Number(p.unit_amount_decimal)) : null);
    if (unidad == null || Number.isNaN(unidad)) {
      conocido = false;
      continue;
    }
    total += unidad * (item.quantity ?? 1);
  }

  return {
    centavos: conocido ? total : null,
    moneda: (primero.currency ?? 'usd').toLowerCase(),
    intervalo: primero.recurring?.interval ?? null,
    cada: primero.recurring?.interval_count ?? 1,
  };
}

/** «US$135», o null cuando el precio no se conoce. */
export function montoDelPrecio(precio: PrecioDeSuscripcion | null | undefined): string | null {
  if (!precio || precio.centavos == null) return null;
  return formatearMonto(precio.centavos, precio.moneda);
}

// ─── Fechas ───────────────────────────────────────────────────────────────────

/**
 * «5 de noviembre» (o «5 de noviembre de 2026») EN HORA DOMINICANA.
 *
 * La zona se pone a mano porque el servidor corre en UTC: una prueba que vence
 * a las 10 p. m. del día 5 en Santo Domingo es la 1 a. m. del 6 en UTC, y el
 * correo diría «6 de noviembre» — un día más de plazo del que de verdad tiene.
 */
export function fechaLarga(d: Date, conAnio = false): string {
  return d.toLocaleDateString('es-DO', {
    day: 'numeric',
    month: 'long',
    ...(conAnio ? { year: 'numeric' as const } : {}),
    timeZone: TZ_RD,
  });
}

/** Segundos de Stripe → Date. */
export function fechaDeStripe(segundos: number): Date {
  return new Date(segundos * 1000);
}

/** `'2026-10-21'` + 7 → `'2026-10-28'`. Aritmética de calendario, sin husos. */
export function sumarDiasISO(iso: string, dias: number): string {
  const [a, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(a, m - 1, d + dias)).toISOString().slice(0, 10);
}

/**
 * Días de calendario (RD) entre `ahora` y `fin`. 3 = «dentro de tres días»,
 * 0 = hoy, negativo = ya pasó.
 *
 * Por fecha y no por horas: «faltan 2.6 días» redondeado hacia arriba daba 3 o
 * 2 según a qué hora del día llegara el evento, y el correo decía «en 3 días»
 * y «el 25 de octubre» sobre el mismo día.
 */
export function diasHastaRD(fin: Date, ahora: Date): number {
  const a = fechaRD(ahora).split('-').map(Number);
  const b = fechaRD(fin).split('-').map(Number);
  return Math.round((Date.UTC(b[0], b[1] - 1, b[2]) - Date.UTC(a[0], a[1] - 1, a[2])) / DIA_MS);
}

/** ¿`fin` cae EXACTAMENTE `dias` días después de hoy, contando por fecha dominicana? */
export function venceExactamenteEn(fin: Date, ahora: Date, dias: number): boolean {
  return fechaRD(fin) === sumarDiasISO(fechaRD(ahora), dias);
}

/**
 * Cuándo es el próximo cobro: en una prueba, el fin de la prueba; en una
 * suscripción activa, el fin del ciclo en curso (el item que más tarde acaba).
 */
export function proximoCobro(
  sub: { status: string; trial_end?: number | null; items?: { data: ItemDePrecio[] } },
): Date | null {
  if (sub.status === 'trialing' && sub.trial_end) return fechaDeStripe(sub.trial_end);
  const fines = (sub.items?.data ?? [])
    .map(i => i.current_period_end)
    .filter((f): f is number => typeof f === 'number');
  return fines.length ? fechaDeStripe(Math.max(...fines)) : null;
}

// ─── Método de pago ───────────────────────────────────────────────────────────

/** Un PaymentMethod de Stripe, en lo que aquí se lee. */
export interface MetodoStripe {
  card?: { last4?: string | null; brand?: string | null } | null;
  us_bank_account?: { last4?: string | null } | null;
  sepa_debit?: { last4?: string | null } | null;
  acss_debit?: { last4?: string | null } | null;
  bacs_debit?: { last4?: string | null } | null;
  au_becs_debit?: { last4?: string | null } | null;
}

export interface MetodoDePago {
  /** Los últimos 4 dígitos. null si el método no los tiene (un wallet, por ejemplo). */
  last4: string | null;
  marca: string | null;
}

/** Los últimos 4 del método, sea tarjeta o cuenta bancaria. */
export function metodoDesdeStripe(pm: MetodoStripe): MetodoDePago {
  const last4 = pm.card?.last4
    ?? pm.us_bank_account?.last4
    ?? pm.sepa_debit?.last4
    ?? pm.acss_debit?.last4
    ?? pm.bacs_debit?.last4
    ?? pm.au_becs_debit?.last4
    ?? null;
  return { last4, marca: pm.card?.brand ?? null };
}

export type ReferenciaDeMetodo = string | MetodoStripe | null | undefined;

/**
 * Con qué método COBRARÁ Stripe: el de la suscripción y, si no tiene, el
 * predeterminado del cliente. Es el mismo orden que sigue Stripe al cobrar, y
 * es a propósito que NO mira las tarjetas guardadas sin predeterminar: con una
 * prueba que termina sin método predeterminado Stripe pausa la suscripción
 * (`missing_payment_method: 'pause'`), aunque haya tarjetas sueltas. Decir «se
 * cobra a tu tarjeta •••• 4242» en ese caso sería prometer un cobro que no va
 * a ocurrir.
 */
export function referenciaDeMetodo(
  sub: { default_payment_method?: ReferenciaDeMetodo },
  // `deleted` es `void` en Stripe.Customer y `true` en DeletedCustomer: de ahí el unknown.
  cliente: { deleted?: unknown; invoice_settings?: { default_payment_method?: ReferenciaDeMetodo } | null } | null | undefined,
): ReferenciaDeMetodo {
  if (sub.default_payment_method) return sub.default_payment_method;
  if (cliente && !cliente.deleted) return cliente.invoice_settings?.default_payment_method ?? null;
  return null;
}

export type VariantePrueba = 'con-tarjeta' | 'sin-tarjeta';

/** Qué versión del aviso de «prueba por vencer» toca. */
export function variantePrueba(metodo: MetodoDePago | null | undefined): VariantePrueba {
  return metodo ? 'con-tarjeta' : 'sin-tarjeta';
}

// ─── Cuándo se avisa ──────────────────────────────────────────────────────────

/** «Tu cuenta está lista» solo tiene sentido si la suscripción está viva y al día. */
export function debeAvisarActivacion(status: string | null | undefined): boolean {
  return status === 'trialing' || status === 'active';
}

/**
 * ¿Hubo dinero? La factura de $0 que Stripe genera al empezar una prueba
 * también dispara `invoice.payment_succeeded`, y «Recibimos tu pago de US$0»
 * es justo el correo que hace dudar de todos los demás.
 */
export function debeAvisarPago(invoice: { amount_paid?: number | null }): boolean {
  return (invoice.amount_paid ?? 0) > 0;
}

// ─── Facturas ─────────────────────────────────────────────────────────────────

/** Lo mínimo que se lee de una factura. Stripe.Invoice lo cumple. */
export interface FacturaDeStripe {
  id?: string | null;
  amount_paid?: number | null;
  currency?: string | null;
  hosted_invoice_url?: string | null;
  parent?: {
    subscription_details?: { subscription?: string | { id: string } | null } | null;
  } | null;
  lines?: { data?: Array<{ amount?: number | null; period?: { start: number; end: number } | null }> } | null;
}

/** La suscripción que originó la factura. Con la API basil vive en `parent`. */
export function suscripcionDeFactura(inv: FacturaDeStripe): string | null {
  const s = inv.parent?.subscription_details?.subscription;
  if (!s) return null;
  return typeof s === 'string' ? s : s.id;
}

/**
 * El tramo que cubre el cobro: del inicio más temprano al fin más tardío de las
 * líneas que SUMAN. Los créditos de un cambio de plan (líneas negativas) cubren
 * el período que se dejó, no el que se pagó, y ensuciarían las fechas.
 * null si no hay líneas, o si el tramo no avanza (un cobro suelto).
 */
export function periodoDeFactura(inv: FacturaDeStripe): { desde: Date; hasta: Date } | null {
  const lineas = (inv.lines?.data ?? []).filter(l => l.period);
  if (lineas.length === 0) return null;

  const cobradas = lineas.filter(l => (l.amount ?? 0) > 0);
  const usadas = cobradas.length ? cobradas : lineas;

  const desde = Math.min(...usadas.map(l => l.period!.start));
  const hasta = Math.max(...usadas.map(l => l.period!.end));
  if (!(hasta > desde)) return null;
  return { desde: fechaDeStripe(desde), hasta: fechaDeStripe(hasta) };
}

/**
 * El recibo que aloja Stripe. Solo se acepta https: la URL termina dentro de un
 * `href` en un correo, y no hay razón para que sea otra cosa.
 */
export function urlDeRecibo(inv: FacturaDeStripe): string | null {
  const u = inv.hosted_invoice_url;
  return u && /^https:\/\//i.test(u) ? u : null;
}

// ─── Idempotencia ─────────────────────────────────────────────────────────────

/** `audit_logs.action` de todo aviso de suscripción ya enviado. */
export const ACCION_AVISO = 'SUSCRIPCION_AVISO';

/**
 * Las llaves (`audit_logs.resource`) con las que se reconoce un aviso ya
 * enviado. Stripe reintenta los webhooks, y recrear una suscripción para
 * extender una prueba dispara `subscription.created` otra vez: sin esto, cada
 * una de esas cosas es un correo repetido.
 */
export const claveAviso = {
  activada: (teamId: number, planClave: string) => `activada:${teamId}:${planClave}`,
  prueba7:  (suscripcionId: string) => `prueba-7:${suscripcionId}`,
  prueba3:  (suscripcionId: string) => `prueba-3:${suscripcionId}`,
  pago:     (facturaId: string) => `pago:${facturaId}`,
} as const;

/** Mientras no pasen estos días, la misma empresa no recibe otra vez «tu cuenta está lista» del mismo plan. */
export const VENTANA_ACTIVADA_DIAS = 60;

/**
 * Cuánto hacia atrás se mira al buscar si ya se avisó. null = sin límite.
 *
 * Solo la activación tiene ventana: su llave es (empresa, plan) y es legítimo
 * que, meses después, la misma empresa vuelva a contratar el plan. Las demás
 * llevan el ID de Stripe de una suscripción o una factura, que no se repite.
 */
export function ventanaDeAviso(clave: string): number | null {
  return clave.startsWith('activada:') ? VENTANA_ACTIVADA_DIAS : null;
}
