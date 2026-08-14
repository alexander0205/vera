/**
 * Los correos de la suscripción.
 *
 * No existía ninguno, y ese era el hueco más caro del billing: la prueba
 * vencía, el cobro fallaba y la gracia se agotaba SIN QUE NADIE SE ENTERARA.
 * El banner solo se ve entrando al sistema, y quien está a punto de dejar de
 * pagar es justamente quien no está entrando.
 *
 * Los cuatro son de una sola idea y un solo botón. Un correo de cobro que
 * obliga a leer dos párrafos para saber qué hacer no se lee.
 */

import { resend, assertSent } from '@/lib/email';
import { PRUEBA, MORA, SOLO_LECTURA } from '@/lib/config/suscripcion';

const DE = 'Zero <noreply@zero.com.do>';

function escapeHtml(s: string | null | undefined): string {
  if (s == null) return '';
  return String(s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]!));
}

/** URL de la pantalla de plan. Un solo sitio para no repetir la ruta. */
function urlPlan(): string {
  return `${process.env.NEXT_PUBLIC_APP_URL ?? ''}/dashboard/suscripcion`;
}

/**
 * La plantilla común.
 *
 * Un botón, no dos: en un correo de cobro toda opción que no sea «arreglarlo»
 * es una excusa para dejarlo para después.
 */
function plantilla(opts: {
  titulo: string;
  color: string;
  saludo: string;
  cuerpo: string;
  boton: string;
  pie?: string;
}): string {
  return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 520px; margin: 0 auto; color: #111827;">
      <h2 style="color: ${opts.color}; font-size: 20px; margin: 0 0 16px;">${escapeHtml(opts.titulo)}</h2>
      <p style="margin: 0 0 12px; line-height: 1.6;">${opts.saludo}</p>
      <p style="margin: 0 0 20px; line-height: 1.6;">${opts.cuerpo}</p>
      <p style="margin: 0 0 20px;">
        <a href="${escapeHtml(urlPlan())}"
           style="background:${opts.color};color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;display:inline-block;font-weight:600;">
          ${escapeHtml(opts.boton)}
        </a>
      </p>
      ${opts.pie ? `<p style="color:#6b7280;font-size:13px;line-height:1.6;margin:0;">${opts.pie}</p>` : ''}
    </div>
  `;
}

const AZUL  = '#2a45c4';
const AMBAR = '#b45309';
const ROJO  = '#b91c1c';

interface Destinatario {
  email: string;
  empresa: string;
  plan: string;
}

// ─── Prueba por vencer ────────────────────────────────────────────────────────

/**
 * Se dispara con `customer.subscription.trial_will_end`, que Stripe manda tres
 * días antes. Es el único aviso que llega ANTES de perder el acceso, así que
 * dice el día exacto y no «pronto».
 */
export async function enviarPruebaPorVencer(
  d: Destinatario & { diasRestantes: number; venceEl: Date },
): Promise<void> {
  const dias = d.diasRestantes === 1 ? 'mañana' : `en ${d.diasRestantes} días`;
  const fecha = d.venceEl.toLocaleDateString('es-DO', { day: 'numeric', month: 'long' });

  const res = await resend.emails.send({
    from: DE,
    to: d.email,
    subject: `Tu prueba de Zero termina ${dias}`,
    html: plantilla({
      titulo: `Tu prueba termina ${dias}`,
      color: AZUL,
      saludo: `Hola, tu período de prueba de <strong>${escapeHtml(d.empresa)}</strong> termina el ${escapeHtml(fecha)}.`,
      cuerpo: `Agrega tu método de pago para seguir emitiendo sin interrupciones con el plan ${escapeHtml(d.plan)}.`,
      boton: 'Agregar método de pago',
      pie: `Si no lo haces, tu cuenta pasa a solo lectura durante ${SOLO_LECTURA.diasTrasPrueba} días: podrás consultar y descargar toda tu información, pero no emitir comprobantes nuevos.`,
    }),
  });
  assertSent(res, 'enviarPruebaPorVencer');
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
    to: d.email,
    subject: 'No pudimos cobrar tu suscripción de Zero',
    html: plantilla({
      titulo: 'No pudimos cobrar tu suscripción',
      color: AMBAR,
      saludo: `Hola, el cobro del plan ${escapeHtml(d.plan)} de <strong>${escapeHtml(d.empresa)}</strong> no pasó.`,
      cuerpo: `Lo más común es una tarjeta vencida o sin fondos. Actualízala y lo reintentamos de inmediato.`,
      boton: 'Actualizar tarjeta',
      pie: `Tienes ${d.diasDeGracia} días para resolverlo. Mientras tanto sigues trabajando con normalidad.`,
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
    to: d.email,
    subject: `${d.empresa} está en solo lectura`,
    html: plantilla({
      titulo: 'Tu cuenta está en solo lectura',
      color: ROJO,
      saludo: `Hola, como ${razon}, <strong>${escapeHtml(d.empresa)}</strong> pasó a solo lectura.`,
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
    to: d.email,
    subject: 'Confirmamos la cancelación de tu suscripción',
    html: plantilla({
      titulo: 'Tu suscripción quedó cancelada',
      color: AZUL,
      saludo: `Hola, cancelamos la suscripción de <strong>${escapeHtml(d.empresa)}</strong>.`,
      cuerpo: `Tu plan ${escapeHtml(d.plan)} sigue activo hasta el <strong>${escapeHtml(fecha)}</strong>, que es hasta donde está pagado. No se te cobrará de nuevo.`,
      boton: 'Reactivar antes de esa fecha',
      pie: 'Si cambias de idea, puedes reactivarla en cualquier momento antes de esa fecha y no se interrumpe nada. Después también, pero volviendo a contratar.',
    }),
  });
  assertSent(res, 'enviarCancelacionProgramada');
}

/** Días de prueba y de gracia, para que las plantillas no repitan números. */
export const AVISOS = { PRUEBA, MORA, SOLO_LECTURA } as const;
