import { resend, assertSent } from './index';

/**
 * El correo de un aviso de cobro escolar.
 *
 * Vive aparte de `lib/email/index.ts` porque ese archivo ya carga con todo el
 * correo transaccional del sistema y esto es de un módulo. Reusa su cliente y
 * su `assertSent`: el SDK de Resend no lanza en errores de API —devuelve
 * `{ data, error }`— así que sin esa comprobación un dominio sin verificar se
 * resolvería como éxito y el aviso quedaría marcado como enviado sin salir.
 */

function escapar(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]!));
}

export async function enviarAvisoCobroEmail(opts: {
  email: string;
  colegio: string;
  asunto: string;
  texto: string;
}) {
  const texto = escapar(opts.texto);
  const colegio = escapar(opts.colegio);
  const res = await resend.emails.send({
    from: 'Zero <noreply@zero.com.do>',
    to: opts.email,
    // El asunto lleva el nombre del colegio delante: al tutor le escriben
    // varios remitentes y "Recordatorio de pago" a secas no dice de quién.
    subject: `${opts.colegio} — ${opts.asunto}`,
    html: `
      <div style="font-family: sans-serif; max-width: 520px; margin: 0 auto;">
        <h2 style="color: #2a45c4; font-size: 18px;">${colegio}</h2>
        <p style="font-size: 15px; line-height: 1.6; color: #111;">${texto}</p>
        <p style="font-size: 13px; color: #666; margin-top: 24px;">
          Si ya realizaste el pago, ignora este mensaje.
        </p>
      </div>
    `,
  });
  assertSent(res, `enviarAvisoCobroEmail(${opts.email})`);
}

/**
 * El correo con el que se le pide a una familia que suba sus documentos.
 *
 * No es un aviso: es una tarea. Quien lo recibe tiene que hacer algo, y el
 * correo se ordena en ese sentido —qué falta, un botón para hacerlo, y cuándo
 * caduca— en vez de empezar por presentarse. Todo lo variable entra por
 * `opts`; aquí no hay ningún nombre ni ninguna fecha escritos a mano.
 *
 * Va en HTML de tabla y con estilos en línea a propósito: Gmail y Outlook
 * descartan `<style>` y flexbox, y este correo se lee sobre todo en el móvil.
 */
export interface EnlaceDocumentosEmail {
  colegio: string;
  /** A quién se le escribe. Sin él, el saludo va sin nombre. */
  tutor: string | null;
  estudiante: string;
  /** Lo que falta por subir. Vacío = el expediente entero. */
  documentos: string[];
  url: string;
  dias: number;
}

/**
 * Arma el asunto y el cuerpo. Separado del envío para poder verlo sin mandar
 * correos: `pnpm tsx scripts/previsualizar-correo-documentos.ts`.
 */
export function armarEnlaceDocumentosEmail(opts: EnlaceDocumentosEmail): { asunto: string; html: string } {
  const colegio = escapar(opts.colegio);
  const estudiante = escapar(opts.estudiante);
  const saludo = opts.tutor ? `Hola, ${escapar(opts.tutor.split(' ')[0])}:` : 'Hola:';
  const unico = opts.documentos.length === 1;

  const lista = opts.documentos.length > 0
    ? `<ul style="margin:0;padding-left:20px;font-size:15px;line-height:1.9;color:#111;">
         ${opts.documentos.map((d) => `<li>${escapar(d)}</li>`).join('')}
       </ul>`
    : `<p style="margin:0;font-size:15px;line-height:1.6;color:#111;">
         Los documentos del expediente que todavía no hemos recibido.
       </p>`;

  const asunto = unico
    ? `${opts.colegio} — Falta ${opts.documentos[0]} de ${opts.estudiante}`
    : `${opts.colegio} — Documentos pendientes de ${opts.estudiante}`;

  const html = `
      <div style="font-family:-apple-system,Segoe UI,sans-serif;max-width:520px;margin:0 auto;padding:8px;">
        <p style="margin:0 0 4px;font-size:13px;color:#6b7280;">${colegio}</p>
        <h1 style="margin:0 0 16px;font-size:20px;color:#111;">
          Nos faltan ${unico ? 'un documento' : 'unos documentos'} de ${estudiante}
        </h1>

        <p style="margin:0 0 12px;font-size:15px;line-height:1.6;color:#111;">
          ${saludo} para completar el expediente de <b>${estudiante}</b> necesitamos que nos
          ${unico ? 'envíes esto' : 'envíes lo siguiente'}:
        </p>

        <div style="margin:0 0 20px;padding:14px 16px;background:#f8f9fc;border-radius:10px;">
          ${lista}
        </div>

        <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 18px;">
          <tr><td style="border-radius:8px;background:#2a45c4;">
            <a href="${opts.url}" style="display:inline-block;padding:12px 22px;font-size:15px;font-weight:600;color:#fff;text-decoration:none;">
              Subir ${unico ? 'el documento' : 'los documentos'}
            </a>
          </td></tr>
        </table>

        <p style="margin:0 0 6px;font-size:14px;line-height:1.6;color:#374151;">
          Se abre en el teléfono: puedes tomarle una foto al papel o adjuntar el archivo
          que ya tengas. No hace falta crear ninguna cuenta.
        </p>
        <p style="margin:0 0 20px;font-size:14px;line-height:1.6;color:#374151;">
          El enlace caduca en <b>${opts.dias} días</b>. Lo que subas lo revisamos antes de darlo por recibido.
        </p>

        <p style="margin:0;font-size:12px;line-height:1.6;color:#9ca3af;border-top:1px solid #e5e7eb;padding-top:14px;">
          Si el botón no funciona, copia esta dirección en tu navegador:<br>
          <span style="color:#6b7280;word-break:break-all;">${opts.url}</span><br><br>
          Este enlace es personal de ${estudiante}: no lo compartas.
        </p>
      </div>
    `;

  return { asunto, html };
}

export async function enviarEnlaceDocumentosEmail(opts: EnlaceDocumentosEmail & { email: string }) {
  const { asunto, html } = armarEnlaceDocumentosEmail(opts);
  const res = await resend.emails.send({
    from: 'Zero <noreply@zero.com.do>',
    to: opts.email,
    subject: asunto,
    html,
  });
  assertSent(res, `enviarEnlaceDocumentosEmail(${opts.email})`);
}

// ── Formulario mandado a una familia ────────────────────────────────────────

export interface EnlaceFormularioEmail {
  colegio: string;
  tutor: string | null;
  estudiante: string;
  /** Cómo se llama el formulario: es lo que la familia va a reconocer. */
  formulario: string;
  url: string;
}

/**
 * Arma el asunto y el cuerpo del correo con el que se le manda un formulario a
 * la familia.
 *
 * Deliberadamente NO promete un plazo: a diferencia del enlace de documentos,
 * el del formulario no caduca solo —es el borrador de esa familia, y caducarlo
 * significaría tirar lo que ya llevaba escrito—.
 */
export function armarEnlaceFormularioEmail(opts: EnlaceFormularioEmail): { asunto: string; html: string } {
  const colegio = escapar(opts.colegio);
  const estudiante = escapar(opts.estudiante);
  const formulario = escapar(opts.formulario);
  const saludo = opts.tutor ? `Hola, ${escapar(opts.tutor.split(' ')[0])}:` : 'Hola:';

  const asunto = `${opts.colegio} — ${opts.formulario}`;

  const html = `
      <div style="font-family:-apple-system,Segoe UI,sans-serif;max-width:520px;margin:0 auto;padding:8px;">
        <p style="margin:0 0 4px;font-size:13px;color:#6b7280;">${colegio}</p>
        <h1 style="margin:0 0 16px;font-size:20px;color:#111;">${formulario}</h1>

        <p style="margin:0 0 20px;font-size:15px;line-height:1.6;color:#111;">
          ${saludo} para completar el expediente de <b>${estudiante}</b> necesitamos que
          contestes este formulario.
        </p>

        <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 18px;">
          <tr><td style="border-radius:8px;background:#2a45c4;">
            <a href="${opts.url}" style="display:inline-block;padding:12px 22px;font-size:15px;font-weight:600;color:#fff;text-decoration:none;">
              Contestar el formulario
            </a>
          </td></tr>
        </table>

        <p style="margin:0 0 20px;font-size:14px;line-height:1.6;color:#374151;">
          No hace falta terminarlo de una sola vez ni crear ninguna cuenta: lo que vayas
          escribiendo se guarda solo, y puedes volver por este mismo enlace cuando quieras.
        </p>

        <p style="margin:0;font-size:12px;line-height:1.6;color:#9ca3af;border-top:1px solid #e5e7eb;padding-top:14px;">
          Si el botón no funciona, copia esta dirección en tu navegador:<br>
          <span style="color:#6b7280;word-break:break-all;">${opts.url}</span><br><br>
          Este enlace es personal de ${estudiante}: no lo compartas.
        </p>
      </div>
    `;

  return { asunto, html };
}

export async function enviarEnlaceFormularioEmail(opts: EnlaceFormularioEmail & { email: string }) {
  const { asunto, html } = armarEnlaceFormularioEmail(opts);
  const res = await resend.emails.send({
    from: 'Zero <noreply@zero.com.do>',
    to: opts.email,
    subject: asunto,
    html,
  });
  assertSent(res, `enviarEnlaceFormularioEmail(${opts.email})`);
}
