/**
 * Los tres correos de la corrida de facturación del colegio.
 *
 * Van a quien administra (owner y admin), no a las familias: cuentan cuánto va
 * a facturar Zero —o cuánto le toca facturar al colegio— y qué hay que mirar
 * antes. Los manda el cron `escolar-corrida-avisos`.
 *
 * Qué se dice lo decide `lib/administracion-escolar/corrida-textos.ts`; esto
 * solo lo pinta, con la misma plantilla de `suscripcion.ts`: un título, un
 * párrafo, un botón. El texto plano viaja también: es lo que lee un cliente de
 * correo que no muestra HTML y lo que mejora la entrega.
 */

import { resend, assertSent } from '@/lib/email';
import { baseDeEnlaces } from '@/lib/config/enlaces';
import {
  redactarAviso,
  type DatosAvisoCorrida,
  type DestinoEnlace,
  type RedaccionCorrida,
} from '@/lib/administracion-escolar/corrida-textos';

const DE = 'Zero <noreply@zero.com.do>';
const AZUL = '#2a45c4';

function escapeHtml(s: string | null | undefined): string {
  if (s == null) return '';
  return String(s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]!));
}

/** A dónde lleva cada botón. Un solo sitio para no repetir las rutas. */
export function urlsDeLaCorrida(): Record<DestinoEnlace, string> {
  const base = baseDeEnlaces();
  return {
    'por-facturar': `${base}/escolar/responsables?filtro=por-facturar`,
    'cuentas-por-cobrar': `${base}/dashboard/cuentas-por-cobrar`,
    tarifas: `${base}/escolar/configuracion/tarifas`,
  };
}

export interface CorreoCorrida {
  asunto: string;
  html: string;
  texto: string;
}

function aHtml(r: RedaccionCorrida, colegio: string, urls: Record<DestinoEnlace, string>): string {
  const cifras = r.cifras.length === 0 ? '' : `
      <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 20px;border-collapse:separate;border-spacing:0 0;">
        <tr>
          ${r.cifras.map((c) => `
          <td style="padding:0 24px 0 0;vertical-align:top;">
            <div style="font-size:22px;font-weight:700;color:#111827;line-height:1.2;">${escapeHtml(c.valor)}</div>
            <div style="font-size:12px;color:#6b7280;margin-top:2px;">${escapeHtml(c.etiqueta)}</div>
          </td>`).join('')}
        </tr>
      </table>`;

  const conceptos = r.conceptos.length === 0 ? '' : `
      <p style="margin:0 0 6px;font-size:13px;font-weight:600;color:#374151;">Por concepto</p>
      <ul style="margin:0 0 20px;padding-left:18px;line-height:1.6;font-size:14px;">
        ${r.conceptos.map((c) => `<li>${escapeHtml(c)}</li>`).join('')}
      </ul>`;

  const revision = r.revision.length === 0 ? '' : `
      ${r.tituloRevision ? `<p style="margin:0 0 6px;font-size:13px;font-weight:600;color:#374151;">${escapeHtml(r.tituloRevision)}</p>` : ''}
      <ul style="margin:0 0 20px;padding-left:18px;line-height:1.6;font-size:14px;">
        ${r.revision.map((c) => `<li>${escapeHtml(c)}</li>`).join('')}
      </ul>`;

  const enlace = r.enlace
    ? `<p style="margin:0 0 16px;font-size:14px;"><a href="${escapeHtml(urls[r.enlace.destino])}" style="color:${AZUL};">${escapeHtml(r.enlace.texto)}</a></p>`
    : '';

  return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 520px; margin: 0 auto; color: #111827;">
      <p style="margin: 0 0 4px; font-size: 13px; color: #6b7280;">${escapeHtml(colegio)}</p>
      <h2 style="color: ${AZUL}; font-size: 20px; margin: 0 0 16px;">${escapeHtml(r.titulo)}</h2>
      <p style="margin: 0 0 16px; line-height: 1.6;">${escapeHtml(r.intro)}</p>
      ${cifras}${conceptos}${revision}
      <p style="margin: 0 0 20px;">
        <a href="${escapeHtml(urls[r.boton.destino])}"
           style="background:${AZUL};color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;display:inline-block;font-weight:600;">
          ${escapeHtml(r.boton.texto)}
        </a>
      </p>
      ${enlace}
      ${r.pie ? `<p style="color:#6b7280;font-size:13px;line-height:1.6;margin:0;">${escapeHtml(r.pie)}</p>` : ''}
    </div>
  `;
}

function aTexto(r: RedaccionCorrida, colegio: string, urls: Record<DestinoEnlace, string>): string {
  const bloques: string[] = [colegio, r.titulo, r.intro];
  if (r.cifras.length > 0) bloques.push(r.cifras.map((c) => `${c.etiqueta}: ${c.valor}`).join('\n'));
  if (r.conceptos.length > 0) bloques.push(['Por concepto', ...r.conceptos.map((c) => `- ${c}`)].join('\n'));
  if (r.revision.length > 0) {
    bloques.push([...(r.tituloRevision ? [r.tituloRevision] : []), ...r.revision.map((c) => `- ${c}`)].join('\n'));
  }
  bloques.push(`${r.boton.texto}: ${urls[r.boton.destino]}`);
  if (r.enlace) bloques.push(`${r.enlace.texto}: ${urls[r.enlace.destino]}`);
  if (r.pie) bloques.push(r.pie);
  return bloques.join('\n\n');
}

/**
 * El correo ya armado, sin enviarlo. Lo usa el cron para el simulacro y las
 * pruebas para ver exactamente qué saldría.
 */
export function armarCorreoCorrida(d: DatosAvisoCorrida): CorreoCorrida {
  const r = redactarAviso(d);
  const urls = urlsDeLaCorrida();
  return { asunto: r.asunto, html: aHtml(r, d.colegio, urls), texto: aTexto(r, d.colegio, urls) };
}

/** Manda el aviso a UNA persona. Lanza si Resend rechaza el envío. */
export async function enviarAvisoCorrida(email: string, d: DatosAvisoCorrida): Promise<void> {
  const correo = armarCorreoCorrida(d);
  const res = await resend.emails.send({
    from: DE,
    to: email,
    subject: correo.asunto,
    html: correo.html,
    text: correo.texto,
  });
  assertSent(res, `enviarAvisoCorrida(${d.tipo}:${d.fecha})`);
}
