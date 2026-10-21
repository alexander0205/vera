/**
 * Los correos de la suscripción.
 *
 * No existía ninguno, y ese era el hueco más caro del billing: la prueba
 * vencía, el cobro fallaba y la gracia se agotaba SIN QUE NADIE SE ENTERARA.
 * El banner solo se ve entrando al sistema, y quien está a punto de dejar de
 * pagar es justamente quien no está entrando.
 *
 * Todos son de una sola idea y un solo botón. Un correo de cobro que
 * obliga a leer dos párrafos para saber qué hacer no se lee.
 *
 * Seis en total: los cuatro de problemas (prueba por vencer, cobro fallido,
 * solo lectura, cancelación) y los dos de que TODO VA BIEN (cuenta activada,
 * pago recibido). Estos dos importan igual que los otros: quien paga sin que
 * nadie se lo confirme termina escribiendo a soporte para preguntar si pasó.
 *
 * Cada correo tiene un `armar*` puro (asunto + HTML) y un `enviar*` que solo
 * lo manda. Lo que se prueba y se revisa a ojo es el primero.
 */

import { resend, assertSent } from '@/lib/email';
import { PRUEBA, MORA, SOLO_LECTURA } from '@/lib/config/suscripcion';
import { baseDeEnlaces } from '@/lib/config/enlaces';
import {
  fechaLarga, formatearMonto, montoDelPrecio, periodicidad, variantePrueba,
  type MetodoDePago, type PrecioDeSuscripcion,
} from '@/lib/suscripcion/datos-aviso';

const DE = 'Zero <noreply@zero.com.do>';
/**
 * A dónde llega la respuesta. Todos estos correos terminan en «responde este
 * correo y te ayudamos», así que la respuesta tiene que llegarle a una persona
 * y no perderse en `noreply@`.
 */
const SOPORTE = 'alexander@zero.com.do';

function escapeHtml(s: string | null | undefined): string {
  if (s == null) return '';
  return String(s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]!));
}

/** URL de la pantalla de plan. Un solo sitio para no repetir la ruta. */
function urlPlan(): string {
  return `${baseDeEnlaces()}/dashboard/suscripcion`;
}

/**
 * La plantilla común.
 *
 * Un botón, no dos: en un correo de cobro toda opción que no sea «arreglarlo»
 * es una excusa para dejarlo para después.
 *
 * `resumen` es una tabla de «dato → valor» (plan, monto, fecha) para los
 * correos que confirman algo: el cliente los lee buscando una cifra, y una cifra
 * enterrada en un párrafo se pierde. Sus valores van como TEXTO y se escapan
 * aquí; `saludo`, `cuerpo` y `pie` son HTML y los escapa quien los arma.
 */
function plantilla(opts: {
  titulo: string;
  color: string;
  saludo: string;
  cuerpo: string;
  boton: string;
  pie?: string;
  resumen?: Array<[string, string]>;
  /** A dónde lleva el botón. Por defecto, la pantalla de plan. */
  url?: string;
}): string {
  const resumen = opts.resumen?.length
    ? `
      <table role="presentation" style="width:100%;border-collapse:collapse;margin:0 0 20px;font-size:14px;">
        ${opts.resumen.map(([dato, valor], i, todas) => {
          const borde = `border-top:1px solid #e5e7eb;${i === todas.length - 1 ? 'border-bottom:1px solid #e5e7eb;' : ''}`;
          return `
        <tr>
          <td style="padding:9px 0;color:#6b7280;${borde}">${escapeHtml(dato)}</td>
          <td style="padding:9px 0;text-align:right;font-weight:600;${borde}">${escapeHtml(valor)}</td>
        </tr>`;
        }).join('')}
      </table>`
    : '';

  return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 520px; margin: 0 auto; color: #111827;">
      <h2 style="color: ${opts.color}; font-size: 20px; margin: 0 0 16px;">${escapeHtml(opts.titulo)}</h2>
      <p style="margin: 0 0 12px; line-height: 1.6;">${opts.saludo}</p>${resumen}
      <p style="margin: 0 0 20px; line-height: 1.6;">${opts.cuerpo}</p>
      <p style="margin: 0 0 20px;">
        <a href="${escapeHtml(opts.url ?? urlPlan())}"
           style="background:${opts.color};color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;display:inline-block;font-weight:600;">
          ${escapeHtml(opts.boton)}
        </a>
      </p>
      ${opts.pie ? `<p style="color:#6b7280;font-size:13px;line-height:1.6;margin:0 0 20px;">${opts.pie}</p>` : ''}
      <p style="margin: 0 0 4px; line-height: 1.6;">¿Tienes alguna pregunta? Responde este correo y con gusto te ayudamos.</p>
      <p style="margin: 0; line-height: 1.6;">Un saludo,<br><strong>El equipo de Zero</strong></p>
    </div>
  `;
}

const AZUL  = '#2a45c4';
const AMBAR = '#b45309';
const ROJO  = '#b91c1c';
const VERDE = '#047857';

interface Destinatario {
  email: string;
  empresa: string;
  plan: string;
}

// ─── Cuenta activada ──────────────────────────────────────────────────────────

/** «a tu tarjeta terminada en 4242». Sin dígitos (un wallet, por ejemplo): «a tu método de pago guardado». */
function metodoTerminada(m: MetodoDePago): string {
  return m.last4 ? `a tu tarjeta terminada en ${escapeHtml(m.last4)}` : 'a tu método de pago guardado';
}

/** «a tu tarjeta •••• 4242». */
function metodoPuntos(m: MetodoDePago): string {
  return m.last4 ? `a tu tarjeta •••• ${escapeHtml(m.last4)}` : 'a tu método de pago guardado';
}

export interface DatosCuentaActivada {
  /** `trialing` = empieza en prueba; `active` = ya está pagando. */
  estado: 'trialing' | 'active';
  precio: PrecioDeSuscripcion | null;
  /** Fin de la prueba, o el próximo cobro si ya paga. */
  fecha: Date | null;
  /** El método con el que Stripe cobrará. null = no hay ninguno puesto. */
  metodo: MetodoDePago | null;
}

/**
 * El primer correo que recibe alguien que contrata o empieza una prueba.
 *
 * Responde, en este orden, lo que se pregunta quien acaba de registrarse: ¿qué
 * plan tengo?, ¿cuánto cuesta?, ¿hasta cuándo es gratis?, ¿se me va a cobrar
 * sin que yo haga nada? Y dice la verdad según haya tarjeta o no — «no tienes
 * que hacer nada» a quien no tiene tarjeta es mandarlo a perder el acceso.
 */
export function armarCuentaActivada(
  d: Destinatario & DatosCuentaActivada,
): { subject: string; html: string } {
  const enPrueba = d.estado === 'trialing';
  const monto = montoDelPrecio(d.precio);
  const fecha = d.fecha ? fechaLarga(d.fecha) : null;
  const cuanto = monto ?? `tu plan ${d.plan}`;

  const resumen: Array<[string, string]> = [['Plan', d.plan]];
  if (monto) resumen.push(['Precio', `${monto} ${periodicidad(d.precio?.intervalo, d.precio?.cada)}`.trim()]);
  if (fecha) resumen.push([enPrueba ? 'Tu prueba termina' : 'Próximo cobro', fecha]);

  let cuerpo: string;
  let boton: string;
  let pie: string;

  if (d.metodo) {
    cuerpo = fecha
      ? enPrueba
        ? `Disfruta tu prueba con tranquilidad: ese día se cobrará ${escapeHtml(cuanto)} ${metodoTerminada(d.metodo)} y todo seguirá funcionando igual. No tienes que hacer nada.`
        : `Tu próximo cobro es el <strong>${escapeHtml(fecha)}</strong>: ${escapeHtml(cuanto)} ${metodoTerminada(d.metodo)}. No tienes que hacer nada.`
      : `El cobro se hará ${metodoTerminada(d.metodo)}. No tienes que hacer nada.`;
    boton = 'Ver mi suscripción';
    pie = 'Si en algún momento quieres cambiar de plan o cancelar, puedes hacerlo desde tu suscripción antes de esa fecha.';
  } else {
    const limite = fecha ? `antes del <strong>${escapeHtml(fecha)}</strong>` : 'a tiempo';
    cuerpo = enPrueba
      ? `Para que no pierdas el acceso al terminar la prueba, agrega tu método de pago ${limite}. Te toma un minuto.`
      : `Para que tu plan se renueve sin interrupciones, agrega un método de pago ${limite}. Te toma un minuto.`;
    boton = 'Agregar método de pago';
    pie = `Si la prueba termina sin método de pago, tu cuenta pasa a solo lectura durante ${SOLO_LECTURA.diasTrasPrueba} días: tu información queda guardada y puedes consultarla y descargarla, pero no emitir comprobantes nuevos.`;
  }

  return {
    subject: '¡Bienvenido a Zero! Tu cuenta ya está lista',
    html: plantilla({
      titulo: '¡Bienvenido a Zero!',
      color: VERDE,
      saludo: `Hola, equipo de <strong>${escapeHtml(d.empresa)}</strong>: gracias por elegir Zero. Tu cuenta ya está activa y lista para trabajar. Este es el resumen de lo que contrataste:`,
      resumen,
      cuerpo,
      boton,
      pie,
    }),
  };
}

/**
 * Se dispara con `customer.subscription.created` (trialing o active). Ver
 * `lib/suscripcion/avisos.ts` para el control de duplicados.
 */
export async function enviarCuentaActivada(
  d: Destinatario & DatosCuentaActivada,
): Promise<void> {
  const { subject, html } = armarCuentaActivada(d);
  const res = await resend.emails.send({ from: DE, replyTo: SOPORTE, to: d.email, subject, html });
  assertSent(res, 'enviarCuentaActivada');
}

// ─── Prueba por vencer ────────────────────────────────────────────────────────

export interface DatosPruebaPorVencer {
  diasRestantes: number;
  venceEl: Date;
  /** Lo que cuesta el plan por ciclo. Sin él, el correo dice «tu plan» en vez de una cifra. */
  precio?: PrecioDeSuscripcion | null;
  /** El método con el que Stripe cobrará. Ausente o null = no hay ninguno. */
  metodo?: MetodoDePago | null;
}

/**
 * Dos correos en uno, según haya con qué cobrar:
 *
 *  · CON método de pago: «el día X se cobra tanto a tu tarjeta •••• 4242». No
 *    es una alarma sino un recordatorio de dinero — el cliente tiene que poder
 *    decir «no, espera, cambio de plan» ANTES del cobro, no después.
 *  · SIN método de pago: «agrega tu método de pago», que sí es una alarma:
 *    Stripe pausa la suscripción al terminar la prueba y la cuenta pasa a solo
 *    lectura.
 */
export function armarPruebaPorVencer(
  d: Destinatario & DatosPruebaPorVencer,
): { subject: string; html: string } {
  const dias = d.diasRestantes <= 0 ? 'hoy'
    : d.diasRestantes === 1 ? 'mañana'
    : `en ${d.diasRestantes} días`;
  const fecha = fechaLarga(d.venceEl);
  const subject = `Tu prueba de Zero termina ${dias}`;
  const titulo = `Tu prueba termina ${dias}`;
  const saludo = `Hola, equipo de <strong>${escapeHtml(d.empresa)}</strong>: esperamos que Zero les esté siendo útil. Te escribimos para recordarte que tu período de prueba termina el <strong>${escapeHtml(fecha)}</strong>.`;

  if (d.metodo && variantePrueba(d.metodo) === 'con-tarjeta') {
    const monto = montoDelPrecio(d.precio);
    const cobro = monto
      ? `se cobra ${escapeHtml(monto)} del plan ${escapeHtml(d.plan)}`
      : `se cobra tu plan ${escapeHtml(d.plan)}`;
    return {
      subject,
      html: plantilla({
        titulo,
        color: AZUL,
        saludo,
        cuerpo: `Ese día ${cobro.replace(/^se cobra/, 'se cobrará')} ${metodoPuntos(d.metodo)} y seguirás trabajando sin ninguna interrupción. Si prefieres otro plan, puedes cambiarlo antes de esa fecha.`,
        boton: 'Ver mi plan',
        pie: 'Si todo está bien así, no tienes que hacer nada. ¡Gracias por seguir con nosotros!',
      }),
    };
  }

  return {
    subject,
    html: plantilla({
      titulo,
      color: AZUL,
      saludo,
      cuerpo: `Para seguir trabajando sin interrupciones con el plan ${escapeHtml(d.plan)}, solo falta agregar tu método de pago. Te toma un minuto.`,
      boton: 'Agregar método de pago',
      pie: `Si la prueba termina sin método de pago, tu cuenta pasa a solo lectura durante ${SOLO_LECTURA.diasTrasPrueba} días: tu información queda guardada y puedes consultarla y descargarla, pero no emitir comprobantes nuevos.`,
    }),
  };
}

/**
 * Sale dos veces por prueba: siete días antes (lo manda el cron diario, que es
 * el único que sabe contar días) y tres antes (`customer.subscription.trial_will_end`,
 * que Stripe manda solo). Es el único aviso que llega ANTES de perder el
 * acceso, así que dice el día exacto y no «pronto».
 */
export async function enviarPruebaPorVencer(
  d: Destinatario & DatosPruebaPorVencer,
): Promise<void> {
  const { subject, html } = armarPruebaPorVencer(d);
  const res = await resend.emails.send({ from: DE, replyTo: SOPORTE, to: d.email, subject, html });
  assertSent(res, 'enviarPruebaPorVencer');
}

// ─── Pago recibido ────────────────────────────────────────────────────────────

export interface DatosPagoRecibido {
  centavos: number;
  moneda: string;
  /** null cuando no se pudo saber el plan (un cobro suelto, sin suscripción). */
  plan: string | null;
  /** El tramo que cubre el cobro. null si la factura no lo trae claro. */
  periodo: { desde: Date; hasta: Date } | null;
  /** El recibo que aloja Stripe. null si no lo hay: el botón lleva a la suscripción. */
  urlRecibo: string | null;
}

/**
 * `invoice.payment_succeeded` con dinero de por medio. Cierra el ciclo que abre
 * «tu cuenta está lista»: el cliente ve que el cobro se hizo, por cuánto y
 * hasta cuándo queda pagado, sin tener que entrar a buscarlo.
 */
export function armarPagoRecibido(
  d: Omit<Destinatario, 'plan'> & DatosPagoRecibido,
): { subject: string; html: string } {
  const monto = formatearMonto(d.centavos, d.moneda);
  const hasta = d.periodo ? fechaLarga(d.periodo.hasta, true) : null;
  const plan = d.plan && d.plan.trim() ? d.plan : null;
  const sujeto = plan ? `Tu plan ${escapeHtml(plan)}` : 'Tu suscripción';

  const resumen: Array<[string, string]> = [];
  if (plan) resumen.push(['Plan', plan]);
  resumen.push(['Monto pagado', monto]);
  if (d.periodo) {
    resumen.push(['Período cubierto', `${fechaLarga(d.periodo.desde)} al ${fechaLarga(d.periodo.hasta, true)}`]);
  }

  return {
    subject: `¡Gracias! Recibimos tu pago de ${monto}`,
    html: plantilla({
      titulo: '¡Gracias por tu pago!',
      color: VERDE,
      saludo: `Hola, equipo de <strong>${escapeHtml(d.empresa)}</strong>: recibimos tu pago de <strong>${escapeHtml(monto)}</strong>. Gracias por confiar en Zero.`,
      resumen,
      cuerpo: hasta
        ? `${sujeto} queda pagado hasta el <strong>${escapeHtml(hasta)}</strong>.`
        : plan ? `${sujeto} sigue activo.` : 'Tu suscripción sigue activa.',
      boton: d.urlRecibo ? 'Ver mi recibo' : 'Ver mi suscripción',
      url: d.urlRecibo ?? undefined,
      pie: d.urlRecibo
        ? 'Aquí tienes el recibo de este cobro; guárdalo para tus registros.'
        : 'El historial de tus cobros está en tu suscripción.',
    }),
  };
}

export async function enviarPagoRecibido(
  d: Omit<Destinatario, 'plan'> & DatosPagoRecibido,
): Promise<void> {
  const { subject, html } = armarPagoRecibido(d);
  const res = await resend.emails.send({ from: DE, replyTo: SOPORTE, to: d.email, subject, html });
  assertSent(res, 'enviarPagoRecibido');
}

// ─── Cobro fallido ────────────────────────────────────────────────────────────

/**
 * `invoice.payment_failed`. Se manda en el PRIMER fallo, no en cada reintento:
 * Stripe reintenta varias veces durante la semana y un correo por intento
 * convierte un aviso en spam propio.
 */
export async function enviarCobroFallido(
  d: Destinatario & { diasDeGracia: number },
): Promise<void> {
  const res = await resend.emails.send({
    from: DE,
    replyTo: SOPORTE,
    to: d.email,
    subject: 'No pudimos cobrar tu suscripción de Zero',
    html: plantilla({
      titulo: 'No pudimos cobrar tu suscripción',
      color: AMBAR,
      saludo: `Hola, equipo de <strong>${escapeHtml(d.empresa)}</strong>: no pudimos procesar el cobro del plan ${escapeHtml(d.plan)}. No te preocupes, tiene arreglo fácil.`,
      cuerpo: `Lo más común es una tarjeta vencida o sin fondos. Actualízala y lo intentamos de nuevo enseguida.`,
      boton: 'Actualizar tarjeta',
      pie: `Tienes ${d.diasDeGracia} días para resolverlo, y mientras tanto sigues trabajando con normalidad.`,
    }),
  });
  assertSent(res, 'enviarCobroFallido');
}

// ─── Cuenta en solo lectura ───────────────────────────────────────────────────

/**
 * El último aviso antes del cierre. Es el más importante de los cuatro y el
 * que más claro tiene que decir qué NO se perdió: quien recibe esto ya está
 * asustado pensando que sus facturas desaparecieron.
 */
export async function enviarSoloLectura(
  d: Destinatario & { motivo: 'prueba' | 'mora'; diasRestantes: number },
): Promise<void> {
  const razon = d.motivo === 'prueba'
    ? 'terminó tu período de prueba'
    : 'no pudimos cobrar tu suscripción';

  const res = await resend.emails.send({
    from: DE,
    replyTo: SOPORTE,
    to: d.email,
    subject: `${d.empresa} está en solo lectura`,
    html: plantilla({
      titulo: 'Tu cuenta está en solo lectura',
      color: ROJO,
      saludo: `Hola, equipo de <strong>${escapeHtml(d.empresa)}</strong>: como ${razon}, la cuenta pasó a solo lectura.`,
      cuerpo: `<strong>No se borró nada.</strong> Puedes entrar, consultar tus facturas, sacar tus reportes y descargar toda tu información. Lo único que no puedes hacer es emitir comprobantes nuevos.`,
      boton: 'Reactivar mi plan',
      pie: `Te quedan ${d.diasRestantes} días de acceso de consulta. Tus datos y comprobantes se conservan.`,
    }),
  });
  assertSent(res, 'enviarSoloLectura');
}

// ─── Cancelación confirmada ───────────────────────────────────────────────────

/**
 * Al programar la cancelación, no al ejecutarla: confirma la fecha hasta la
 * que pagó. Sin este correo, quien cancela un día 3 cree que perdió el mes.
 */
export async function enviarCancelacionProgramada(
  d: Destinatario & { activoHasta: Date },
): Promise<void> {
  const fecha = d.activoHasta.toLocaleDateString('es-DO', {
    day: 'numeric', month: 'long', year: 'numeric',
  });

  const res = await resend.emails.send({
    from: DE,
    replyTo: SOPORTE,
    to: d.email,
    subject: 'Confirmamos la cancelación de tu suscripción',
    html: plantilla({
      titulo: 'Tu suscripción quedó cancelada',
      color: AZUL,
      saludo: `Hola, equipo de <strong>${escapeHtml(d.empresa)}</strong>: confirmamos la cancelación de tu suscripción. Gracias por el tiempo que trabajaste con Zero.`,
      cuerpo: `Tu plan ${escapeHtml(d.plan)} sigue activo hasta el <strong>${escapeHtml(fecha)}</strong>, que es hasta donde está pagado. No se te cobrará de nuevo.`,
      boton: 'Reactivar antes de esa fecha',
      pie: 'Si cambias de idea, puedes reactivarla en cualquier momento antes de esa fecha y no se interrumpe nada. Después también, pero volviendo a contratar.',
    }),
  });
  assertSent(res, 'enviarCancelacionProgramada');
}

/** Días de prueba y de gracia, para que las plantillas no repitan números. */
export const AVISOS = { PRUEBA, MORA, SOLO_LECTURA } as const;
