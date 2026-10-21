/**
 * Los avisos de suscripción que salen por Stripe y por el cron, en un solo sitio.
 *
 * Cuatro correos, y los cuatro con el mismo contrato:
 *
 *  1. SE MANDAN UNA VEZ. Stripe reintenta cualquier webhook que no contestó
 *     200 a tiempo, y recrear una suscripción para extender una prueba dispara
 *     `customer.subscription.created` de nuevo. Cada aviso tiene una llave
 *     (`claveAviso`) y se mira en `audit_logs` antes de mandar; se anota
 *     DESPUÉS de que el envío salió bien.
 *  2. DICEN LO QUE STRIPE DICE AHORA. El sobre del evento puede llegar viejo,
 *     así que antes de escribir un monto, una fecha o «tu tarjeta •••• 4242» se
 *     le pregunta a la API por la suscripción vigente — la misma filosofía de
 *     `sincronizarConStripe`.
 *  3. NUNCA TUMBAN A QUIEN LOS LLAMA. Aquí los errores se lanzan; quien llama
 *     decide (el webhook los traga para que Stripe no reintente un cambio de
 *     plan ya aplicado; el cron los cuenta).
 *
 * Los cálculos —formatos, fechas, qué variante, qué llave— están en
 * `datos-aviso.ts`, puros y probados. Esto es el pegamento con Stripe y la base.
 */

import 'server-only';
import type Stripe from 'stripe';
import { stripe } from '@/lib/payments/stripe';
import { planDeLaSuscripcion } from '@/lib/payments/plan-de-suscripcion';
import { FREE_PLAN } from '@/lib/config/plans';
import { BILLING_ENABLED } from '@/lib/config/billing';
import {
  destinatarioDeSuscripcion, type DestinatarioSuscripcion,
} from '@/lib/suscripcion/destinatario';
import {
  enviarCuentaActivada, enviarPruebaPorVencer, enviarPagoRecibido,
} from '@/lib/email/suscripcion';
import {
  claveAviso, debeAvisarActivacion, debeAvisarPago, diasHastaRD, fechaDeStripe,
  metodoDesdeStripe, periodoDeFactura, precioDeSuscripcion, proximoCobro,
  referenciaDeMetodo, suscripcionDeFactura, urlDeRecibo, venceExactamenteEn,
  ventanaDeAviso, type MetodoDePago, type MetodoStripe,
} from '@/lib/suscripcion/datos-aviso';
import {
  pruebasQueTerminanEntre, registrarAviso, yaAvisado,
} from '@/lib/suscripcion/avisos-almacen';

const DIA_MS = 86_400_000;

/**
 * - `enviado`          — salió el correo y quedó anotado.
 * - `ya-enviado`       — la llave ya estaba anotada; no se hizo nada.
 * - `omitido`          — no tocaba (billing apagado, factura de $0, la
 *                        suscripción ya no está en prueba…).
 * - `sin-destinatario` — la empresa no tiene a quién escribirle.
 */
export type ResultadoAviso = 'enviado' | 'ya-enviado' | 'omitido' | 'sin-destinatario';

// ─── Lo que se le pregunta a Stripe ───────────────────────────────────────────

/** La suscripción como está AHORA, con el método de pago ya expandido. */
async function suscripcionVigente(id: string): Promise<Stripe.Subscription> {
  return stripe.subscriptions.retrieve(id, { expand: ['default_payment_method'] });
}

/**
 * Con qué método cobrará Stripe esta suscripción, o null si no hay ninguno.
 *
 * Lanza si Stripe falla: confundir «no pude preguntar» con «no tiene tarjeta»
 * le diría «agrega tu método de pago» a quien ya lo tiene. Es mejor no mandar
 * el correo que mandar el equivocado.
 */
export async function metodoDePagoDe(sub: Stripe.Subscription): Promise<MetodoDePago | null> {
  let cliente: Stripe.Customer | Stripe.DeletedCustomer | null = null;
  if (!sub.default_payment_method) {
    const id = typeof sub.customer === 'string' ? sub.customer : sub.customer.id;
    cliente = await stripe.customers.retrieve(id, {
      expand: ['invoice_settings.default_payment_method'],
    });
  }

  const ref = referenciaDeMetodo(sub, cliente);
  if (!ref) return null;

  const pm: MetodoStripe = typeof ref === 'string' ? await stripe.paymentMethods.retrieve(ref) : ref;
  return metodoDesdeStripe(pm);
}

/**
 * El plan que trae la suscripción (por precio, y por producto si es un precio
 * especial), ya con su nombre de pantalla. Si no se reconoce ninguno, cae al
 * que ya tenía la empresa.
 */
async function nombreDelPlan(
  sub: Stripe.Subscription,
  respaldo: string,
): Promise<{ clave: string | null; nombre: string }> {
  const { plan } = await planDeLaSuscripcion(sub);
  return plan.key === FREE_PLAN.key
    ? { clave: null, nombre: respaldo }
    : { clave: plan.key, nombre: plan.name };
}

// ─── El control de duplicados ─────────────────────────────────────────────────

/**
 * Manda un aviso SOLO si esa llave no salió ya.
 *
 * `enviar` recibe al destinatario y devuelve si de verdad mandó algo: puede
 * decidir que no toca (`omitido`) tras mirar la suscripción vigente, y en ese
 * caso no se anota nada — mañana, con otros datos, podría tocar.
 */
async function unaVez(
  teamId: number,
  clave: string,
  enviar: (d: DestinatarioSuscripcion) => Promise<'enviado' | 'omitido'>,
  meta: Record<string, unknown> = {},
): Promise<ResultadoAviso> {
  if (await yaAvisado(clave, ventanaDeAviso(clave))) return 'ya-enviado';

  const destinatario = await destinatarioDeSuscripcion(teamId);
  if (!destinatario) {
    console.warn(`[avisos] team ${teamId} sin destinatario para ${clave}`);
    return 'sin-destinatario';
  }

  const resultado = await enviar(destinatario);
  if (resultado === 'enviado') await registrarAviso(teamId, clave, meta);
  return resultado;
}

// ─── 1. Cuenta activada ───────────────────────────────────────────────────────

/**
 * `customer.subscription.created` con la suscripción en prueba o pagando.
 *
 * La llave es (empresa, plan) y no la suscripción: ampliar una prueba se hace
 * creando OTRA suscripción para la misma empresa y el mismo plan, y quien ya
 * recibió «tu cuenta está lista» no necesita recibirlo de nuevo. Durante 60
 * días, claro: pasado ese tiempo es un cliente que vuelve.
 */
export async function avisarCuentaActivada(
  teamId: number,
  suscripcionId: string,
): Promise<ResultadoAviso> {
  // Los enlaces del correo llevan a /dashboard/suscripcion, que con el billing
  // apagado da 404: no se manda un botón que no lleva a ninguna parte.
  if (!BILLING_ENABLED) return 'omitido';

  const sub = await suscripcionVigente(suscripcionId);
  if (!debeAvisarActivacion(sub.status)) return 'omitido';

  const { plan } = await planDeLaSuscripcion(sub);
  const claveDelPlan = plan.key === FREE_PLAN.key ? 'desconocido' : plan.key;

  return unaVez(teamId, claveAviso.activada(teamId, claveDelPlan), async (d) => {
    const metodo = await metodoDePagoDe(sub);
    await enviarCuentaActivada({
      ...d,
      plan: plan.key === FREE_PLAN.key ? d.plan : plan.name,
      estado: sub.status as 'trialing' | 'active',
      precio: precioDeSuscripcion(sub),
      fecha: proximoCobro(sub),
      metodo,
    });
    return 'enviado';
  }, { aviso: 'activada', suscripcionId, plan: claveDelPlan });
}

// ─── 2 y 3. Prueba por vencer (7 y 3 días antes) ──────────────────────────────

/**
 * El aviso de «tu prueba termina el X». Lo mandan dos disparadores y lleva
 * llaves distintas para que no se pisen: el cron a 7 días y el webhook de
 * Stripe a 3.
 */
export async function avisarPruebaPorVencer(opts: {
  teamId: number;
  suscripcionId: string;
  diasAntes: 7 | 3;
  ahora?: Date;
}): Promise<ResultadoAviso> {
  const { teamId, suscripcionId, diasAntes } = opts;
  const ahora = opts.ahora ?? new Date();

  const clave = diasAntes === 7
    ? claveAviso.prueba7(suscripcionId)
    : claveAviso.prueba3(suscripcionId);

  return unaVez(teamId, clave, async (d) => {
    // La suscripción de ahora, no la del sobre ni la de la fila: la prueba se
    // pudo extender, cancelar o convertir en pago desde que se programó esto.
    const sub = await suscripcionVigente(suscripcionId);
    if (sub.status !== 'trialing' || !sub.trial_end) return 'omitido';

    const venceEl = fechaDeStripe(sub.trial_end);
    // A siete días se exige que de verdad falten siete: si la prueba se movió,
    // el correo diría «en 7 días» sobre una fecha que ya no lo es.
    if (diasAntes === 7 && !venceExactamenteEn(venceEl, ahora, 7)) return 'omitido';

    const metodo = await metodoDePagoDe(sub);
    const { nombre } = await nombreDelPlan(sub, d.plan);

    await enviarPruebaPorVencer({
      ...d,
      plan: nombre,
      diasRestantes: Math.max(0, diasHastaRD(venceEl, ahora)),
      venceEl,
      precio: precioDeSuscripcion(sub),
      metodo,
    });
    return 'enviado';
  }, { aviso: `prueba-${diasAntes}`, suscripcionId });
}

export interface ResumenAvisos7 {
  /** Pruebas que terminan cerca de la fecha, antes del filtro exacto. */
  revisadas: number;
  enviados: number[];
  /** Ya avisadas antes, o que ya no tocaba avisar. */
  omitidas: number;
  fallos: { teamId: number; error: string }[];
}

/**
 * La parte del barrido diario que avisa a quien le quedan EXACTAMENTE siete
 * días de prueba, contados por fecha dominicana.
 *
 * Ni «siete o menos» ni «entre cuatro y siete»: como cada prueba lleva su
 * llave, un rango reenviaría el correo si algún día el cron se atrasara, pero
 * también diría «en 7 días» sobre una prueba que ya está en 5. Si un día no
 * corre, ese aviso se pierde y queda el de tres días, que lo manda Stripe.
 */
export async function avisarPruebasA7Dias(ahora: Date = new Date()): Promise<ResumenAvisos7> {
  // Filtro grueso (5 a 9 días) para no traer todas las pruebas; el exacto va abajo.
  const candidatas = await pruebasQueTerminanEntre(
    new Date(ahora.getTime() + 5 * DIA_MS),
    new Date(ahora.getTime() + 9 * DIA_MS),
  );

  const resumen: ResumenAvisos7 = { revisadas: candidatas.length, enviados: [], omitidas: 0, fallos: [] };

  for (const c of candidatas) {
    if (!venceExactamenteEn(c.trialEnd, ahora, 7)) { resumen.omitidas++; continue; }

    // Una por una y atrapando cada error: que Stripe falle con una empresa no
    // puede dejar sin aviso a las que vienen detrás.
    try {
      const r = await avisarPruebaPorVencer({
        teamId: c.teamId, suscripcionId: c.suscripcionId, diasAntes: 7, ahora,
      });
      if (r === 'enviado') resumen.enviados.push(c.teamId);
      else if (r === 'sin-destinatario') resumen.fallos.push({ teamId: c.teamId, error: 'sin destinatario' });
      else resumen.omitidas++;
    } catch (err) {
      resumen.fallos.push({ teamId: c.teamId, error: err instanceof Error ? err.message : String(err) });
    }
  }

  return resumen;
}

// ─── 4. Pago recibido ─────────────────────────────────────────────────────────

/**
 * `invoice.payment_succeeded` con dinero cobrado. La factura de $0 con la que
 * Stripe abre una prueba también dispara el evento: esa no es un pago y no se
 * avisa.
 */
export async function avisarPagoRecibido(
  teamId: number,
  invoice: Stripe.Invoice,
): Promise<ResultadoAviso> {
  if (!BILLING_ENABLED) return 'omitido';
  if (!debeAvisarPago(invoice) || !invoice.id) return 'omitido';

  return unaVez(teamId, claveAviso.pago(invoice.id), async (d) => {
    // El plan es decoración del recibo: si no se puede averiguar, el correo
    // sale igual con el que ya tiene la empresa. Un recibo no se pierde por
    // un nombre de plan.
    let plan: string | null = d.plan;
    const suscripcionId = suscripcionDeFactura(invoice);
    if (suscripcionId) {
      try {
        const sub = await stripe.subscriptions.retrieve(suscripcionId);
        plan = (await nombreDelPlan(sub, d.plan)).nombre;
      } catch (err) {
        console.warn(`[avisos] no se pudo resolver el plan de ${suscripcionId} para el recibo:`, err);
      }
    }
    // «Plan Gratis» en un recibo de dinero es una contradicción: sin plan
    // reconocible, el correo habla de «tu suscripción» a secas.
    if (plan === FREE_PLAN.name) plan = null;

    await enviarPagoRecibido({
      email: d.email,
      empresa: d.empresa,
      centavos: invoice.amount_paid,
      moneda: invoice.currency,
      plan,
      periodo: periodoDeFactura(invoice),
      urlRecibo: urlDeRecibo(invoice),
    });
    return 'enviado';
  }, { aviso: 'pago', facturaId: invoice.id, centavos: invoice.amount_paid, moneda: invoice.currency });
}
