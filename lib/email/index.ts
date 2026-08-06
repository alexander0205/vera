import { Resend, type Attachment } from 'resend';

export const resend = new Resend(process.env.RESEND_API_KEY);

/**
 * El SDK de Resend no lanza en errores de API: devuelve { data, error }. Sin
 * esta comprobación un 401 (key inválida), 403 (dominio sin verificar) o 422
 * (remitente mal formado) se resuelven como éxito y el fallo queda mudo.
 */
export function assertSent(
  result: { data: unknown; error: unknown },
  contexto: string,
): void {
  if (result.error) {
    throw new Error(`Resend falló en ${contexto}: ${JSON.stringify(result.error)}`);
  }
}

function escapeHtml(s: string | null | undefined): string {
  if (s == null) return '';
  return String(s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[c]!));
}

export async function sendPasswordResetEmail(email: string, token: string, name: string | null) {
  const resetUrl = `${process.env.NEXT_PUBLIC_APP_URL}/reset-password?token=${encodeURIComponent(token)}`;
  const safeName = escapeHtml(name);
  const res = await resend.emails.send({
    from: 'Zero <noreply@zero.com.do>',
    to: email,
    subject: 'Restablecer contraseña — Zero',
    html: `
      <div style="font-family: sans-serif; max-width: 500px; margin: 0 auto;">
        <h2 style="color: #2a45c4;">Restablecer contraseña</h2>
        <p>Hola${safeName ? ` ${safeName}` : ''},</p>
        <p>Recibimos una solicitud para restablecer la contraseña de tu cuenta Zero.</p>
        <p>
          <a href="${escapeHtml(resetUrl)}" style="background:#2a45c4;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;display:inline-block;font-weight:600;">
            Restablecer contraseña
          </a>
        </p>
        <p style="color:#6b7280;font-size:14px;">Este enlace expira en 1 hora. Si no solicitaste este cambio, ignora este email.</p>
      </div>
    `,
  });
  assertSent(res, 'sendPasswordResetEmail');
}

export async function sendEmailVerificationEmail(email: string, token: string, name: string | null) {
  const verifyUrl = `${process.env.NEXT_PUBLIC_APP_URL}/verify-email?token=${encodeURIComponent(token)}`;
  const safeName = escapeHtml(name);
  const res = await resend.emails.send({
    from: 'Zero <noreply@zero.com.do>',
    to: email,
    subject: 'Verificar tu email — Zero',
    html: `
      <div style="font-family: sans-serif; max-width: 500px; margin: 0 auto;">
        <h2 style="color: #2a45c4;">Verifica tu email</h2>
        <p>Hola${safeName ? ` ${safeName}` : ''},</p>
        <p>Gracias por registrarte en Zero. Confirma tu dirección de email para comenzar.</p>
        <p>
          <a href="${escapeHtml(verifyUrl)}" style="background:#2a45c4;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;display:inline-block;font-weight:600;">
            Verificar email
          </a>
        </p>
        <p style="color:#6b7280;font-size:14px;">Este enlace expira en 24 horas.</p>
      </div>
    `,
  });
  assertSent(res, 'sendEmailVerificationEmail');
}

export async function sendInvitationEmail(
  email: string,
  invitedByName: string | null,
  teamName: string,
  token: string,
) {
  const acceptUrl = `${process.env.NEXT_PUBLIC_APP_URL}/invitations/accept?token=${encodeURIComponent(token)}`;
  const safeInvitedBy = escapeHtml(invitedByName) || 'Alguien';
  const safeTeam = escapeHtml(teamName);
  const res = await resend.emails.send({
    from: 'Zero <noreply@zero.com.do>',
    to: email,
    subject: `Invitación a ${teamName} en Zero`,
    html: `
      <div style="font-family: sans-serif; max-width: 500px; margin: 0 auto;">
        <h2 style="color: #2a45c4;">Te invitaron a ${safeTeam}</h2>
        <p>${safeInvitedBy} te ha invitado a colaborar en <strong>${safeTeam}</strong> en Zero.</p>
        <p>
          <a href="${escapeHtml(acceptUrl)}" style="background:#2a45c4;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;display:inline-block;font-weight:600;">
            Aceptar invitación
          </a>
        </p>
        <p style="color:#6b7280;font-size:14px;">Si no conoces a quien te invitó, puedes ignorar este email.</p>
      </div>
    `,
  });
  assertSent(res, 'sendInvitationEmail');
}

// ─── Cuadre de caja ───────────────────────────────────────────────────────────

/**
 * Notifica a los admins/owners del equipo que un cajero solicitó cierre
 * con descuadre y requiere su aprobación.
 */
export async function sendCajaCierreAprobacionEmail(opts: {
  adminEmails:  { email: string; name: string | null }[];
  cajeroNombre: string;
  numeroCierre: string;
  esperadoDOP:  string;   // ya formateado, ej: "12,500.00"
  contadoDOP:   string;
  diferenciaDOP: string;
  diferenciaSigNo: '+' | '-';  // signo de la diferencia
  cierreObs:    string | null;
  teamName:     string;
  aprobacionUrl: string;
}) {
  const {
    adminEmails, cajeroNombre, numeroCierre,
    esperadoDOP, contadoDOP, diferenciaDOP, diferenciaSigNo,
    cierreObs, teamName, aprobacionUrl,
  } = opts;

  if (adminEmails.length === 0) return;

  const diferColor  = diferenciaSigNo === '-' ? '#dc2626' : '#d97706';   // rojo=faltante, ámbar=sobrante
  const diferLabel  = diferenciaSigNo === '-' ? 'Faltante' : 'Sobrante';
  const safeTeam    = escapeHtml(teamName);
  const safeCajero  = escapeHtml(cajeroNombre);
  const safeNumero  = escapeHtml(numeroCierre);
  const safeUrl     = escapeHtml(aprobacionUrl);
  const safeObs     = cierreObs ? escapeHtml(cierreObs) : null;

  const html = `
    <div style="font-family:sans-serif;max-width:560px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb;">
      <!-- Header -->
      <div style="background:#2a45c4;padding:24px 28px;">
        <p style="margin:0 0 4px;color:rgba(255,255,255,.7);font-size:12px;text-transform:uppercase;letter-spacing:.08em;">Zero · Cuadre de caja</p>
        <h1 style="margin:0;color:#fff;font-size:20px;font-weight:700;">Aprobación pendiente</h1>
      </div>

      <!-- Body -->
      <div style="padding:28px;">
        <p style="margin:0 0 20px;color:#374151;font-size:15px;">
          El cajero <strong>${safeCajero}</strong> ha solicitado el cierre del turno
          <strong>${safeNumero}</strong> en <strong>${safeTeam}</strong> y requiere tu aprobación.
        </p>

        <!-- Tabla de cifras -->
        <table style="width:100%;border-collapse:collapse;margin-bottom:20px;font-size:14px;">
          <tr style="background:#f9fafb;">
            <td style="padding:10px 14px;color:#6b7280;border-bottom:1px solid #e5e7eb;">Efectivo esperado</td>
            <td style="padding:10px 14px;text-align:right;font-weight:600;color:#111827;border-bottom:1px solid #e5e7eb;">DOP ${escapeHtml(esperadoDOP)}</td>
          </tr>
          <tr>
            <td style="padding:10px 14px;color:#6b7280;border-bottom:1px solid #e5e7eb;">Efectivo contado</td>
            <td style="padding:10px 14px;text-align:right;font-weight:600;color:#111827;border-bottom:1px solid #e5e7eb;">DOP ${escapeHtml(contadoDOP)}</td>
          </tr>
          <tr style="background:#fff7ed;">
            <td style="padding:10px 14px;font-weight:700;color:${diferColor};">${diferLabel}</td>
            <td style="padding:10px 14px;text-align:right;font-weight:700;color:${diferColor};">DOP ${escapeHtml(diferenciaDOP)}</td>
          </tr>
        </table>

        ${safeObs ? `
        <!-- Justificación del cajero -->
        <div style="background:#f3f4f6;border-left:3px solid #9ca3af;border-radius:4px;padding:12px 16px;margin-bottom:20px;">
          <p style="margin:0 0 4px;font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:#6b7280;">Justificación del cajero</p>
          <p style="margin:0;font-size:14px;color:#374151;">"${safeObs}"</p>
        </div>
        ` : ''}

        <!-- CTA -->
        <div style="text-align:center;margin-bottom:8px;">
          <a href="${safeUrl}"
             style="display:inline-block;background:#2a45c4;color:#fff;padding:13px 32px;border-radius:8px;text-decoration:none;font-weight:700;font-size:15px;">
            Revisar y aprobar
          </a>
        </div>
        <p style="margin:12px 0 0;text-align:center;font-size:12px;color:#9ca3af;">
          O accede desde Zero → Caja → Aprobaciones
        </p>
      </div>

      <!-- Footer -->
      <div style="background:#f9fafb;border-top:1px solid #e5e7eb;padding:16px 28px;">
        <p style="margin:0;font-size:12px;color:#9ca3af;">
          Recibes este correo porque tienes rol de administrador en <strong>${safeTeam}</strong>.
          Si no reconoces esta solicitud, contáctanos.
        </p>
      </div>
    </div>
  `;

  // Enviar a todos los admins en paralelo
  await Promise.allSettled(
    adminEmails.map(({ email, name }) =>
      resend.emails.send({
        from:    'Zero <noreply@zero.com.do>',
        to:      email,
        subject: `⚠️ Cierre de caja pendiente — ${numeroCierre} · ${teamName}`,
        html,
      }).then(res => {
        // Un error de API de Resend llega en el cuerpo, no como excepción:
        // sin este assert el fallo por destinatario quedaba mudo.
        assertSent(res, `sendCajaCierreAprobacionEmail(${email})`);
      }).catch(err => {
        console.error(`[caja-email] Error enviando a ${email}:`, err);
      }),
    ),
  );
}

/** Notifica al cajero que su cuadre fue aprobado por el admin. */
export async function sendCajaCierreAprobadoEmail(opts: {
  cajeroEmail: string;
  cajeroNombre: string | null;
  numeroCierre: string;
  esperadoDOP:  string;
  contadoDOP:   string;
  diferenciaDOP: string;
  cuadrado: boolean;          // true si diferencia === 0
  aprobacionObs: string | null;
  teamName: string;
  appUrl: string;
}) {
  const {
    cajeroEmail, cajeroNombre, numeroCierre,
    esperadoDOP, contadoDOP, diferenciaDOP, cuadrado,
    aprobacionObs, teamName, appUrl,
  } = opts;

  const safeName   = escapeHtml(cajeroNombre) || 'Cajero';
  const safeNum    = escapeHtml(numeroCierre);
  const safeTeam   = escapeHtml(teamName);
  const safeObs    = aprobacionObs ? escapeHtml(aprobacionObs) : null;
  const safeUrl    = escapeHtml(appUrl);
  const diferenciaRow = cuadrado ? '' : `
    <tr style="background:#fff7ed;">
      <td style="padding:10px 14px;color:#d97706;font-weight:700;">Diferencia</td>
      <td style="padding:10px 14px;text-align:right;font-weight:700;color:#d97706;">DOP ${escapeHtml(diferenciaDOP)}</td>
    </tr>`;

  const res = await resend.emails.send({
    from:    'Zero <noreply@zero.com.do>',
    to:      cajeroEmail,
    subject: `✓ Cuadre aprobado — ${numeroCierre} · ${teamName}`,
    html: `
      <div style="font-family:sans-serif;max-width:520px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb;">
        <div style="background:#2a45c4;padding:24px 28px;">
          <p style="margin:0 0 4px;color:rgba(255,255,255,.7);font-size:12px;text-transform:uppercase;letter-spacing:.08em;">Zero · Cuadre de caja</p>
          <h1 style="margin:0;color:#fff;font-size:20px;font-weight:700;">✓ Cuadre aprobado</h1>
        </div>
        <div style="padding:28px;">
          <p style="margin:0 0 20px;color:#374151;font-size:15px;">
            Hola <strong>${safeName}</strong>, el administrador de <strong>${safeTeam}</strong>
            aprobó tu cuadre de caja <strong>${safeNum}</strong>.
          </p>
          <table style="width:100%;border-collapse:collapse;margin-bottom:20px;font-size:14px;">
            <tr style="background:#f9fafb;">
              <td style="padding:10px 14px;color:#6b7280;border-bottom:1px solid #e5e7eb;">Esperado</td>
              <td style="padding:10px 14px;text-align:right;font-weight:600;color:#111827;border-bottom:1px solid #e5e7eb;">DOP ${escapeHtml(esperadoDOP)}</td>
            </tr>
            <tr>
              <td style="padding:10px 14px;color:#6b7280;border-bottom:1px solid #e5e7eb;">Contado</td>
              <td style="padding:10px 14px;text-align:right;font-weight:600;color:#111827;border-bottom:1px solid #e5e7eb;">DOP ${escapeHtml(contadoDOP)}</td>
            </tr>
            ${diferenciaRow}
          </table>
          ${safeObs ? `
          <div style="background:#f0fdf4;border-left:3px solid #22c55e;border-radius:4px;padding:12px 16px;margin-bottom:20px;">
            <p style="margin:0 0 4px;font-size:11px;text-transform:uppercase;color:#6b7280;">Nota del administrador</p>
            <p style="margin:0;font-size:14px;color:#374151;">"${safeObs}"</p>
          </div>` : ''}
          <div style="text-align:center;">
            <a href="${safeUrl}/dashboard/caja/historial"
               style="display:inline-block;background:#2a45c4;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px;">
              Ver historial de caja
            </a>
          </div>
        </div>
        <div style="background:#f9fafb;border-top:1px solid #e5e7eb;padding:14px 28px;">
          <p style="margin:0;font-size:12px;color:#9ca3af;">Este correo es una confirmación automática de Zero.</p>
        </div>
      </div>`,
  });
  assertSent(res, 'sendCajaCierreAprobadoEmail');
}

/** Notifica al cajero que su cuadre fue rechazado y debe recontar. */
export async function sendCajaCierreRechazadoEmail(opts: {
  cajeroEmail:  string;
  cajeroNombre: string | null;
  numeroCierre: string;
  motivo:       string;
  teamName:     string;
  appUrl:       string;
}) {
  const { cajeroEmail, cajeroNombre, numeroCierre, motivo, teamName, appUrl } = opts;
  const safeName = escapeHtml(cajeroNombre) || 'Cajero';
  const safeNum  = escapeHtml(numeroCierre);
  const safeTeam = escapeHtml(teamName);
  const safeMot  = escapeHtml(motivo);
  const safeUrl  = escapeHtml(appUrl);

  const res = await resend.emails.send({
    from:    'Zero <noreply@zero.com.do>',
    to:      cajeroEmail,
    subject: `✗ Cuadre rechazado — ${numeroCierre} · ${teamName}`,
    html: `
      <div style="font-family:sans-serif;max-width:520px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb;">
        <div style="background:#dc2626;padding:24px 28px;">
          <p style="margin:0 0 4px;color:rgba(255,255,255,.7);font-size:12px;text-transform:uppercase;letter-spacing:.08em;">Zero · Cuadre de caja</p>
          <h1 style="margin:0;color:#fff;font-size:20px;font-weight:700;">✗ Cuadre rechazado</h1>
        </div>
        <div style="padding:28px;">
          <p style="margin:0 0 20px;color:#374151;font-size:15px;">
            Hola <strong>${safeName}</strong>, el administrador de <strong>${safeTeam}</strong>
            rechazó tu cuadre <strong>${safeNum}</strong> y tu turno fue reabierto para que puedas recontar.
          </p>
          <div style="background:#fef2f2;border-left:3px solid #dc2626;border-radius:4px;padding:14px 16px;margin-bottom:20px;">
            <p style="margin:0 0 4px;font-size:11px;text-transform:uppercase;color:#6b7280;">Motivo del rechazo</p>
            <p style="margin:0;font-size:14px;color:#374151;font-weight:500;">"${safeMot}"</p>
          </div>
          <p style="color:#6b7280;font-size:13px;margin:0 0 20px;">
            Ingresa al sistema, revisa tu caja físicamente y vuelve a firmar el cuadre con el conteo correcto.
          </p>
          <div style="text-align:center;">
            <a href="${safeUrl}/dashboard/caja"
               style="display:inline-block;background:#dc2626;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px;">
              Ir a mi caja
            </a>
          </div>
        </div>
        <div style="background:#f9fafb;border-top:1px solid #e5e7eb;padding:14px 28px;">
          <p style="margin:0;font-size:12px;color:#9ca3af;">Este correo es una confirmación automática de Zero.</p>
        </div>
      </div>`,
  });
  assertSent(res, 'sendCajaCierreRechazadoEmail');
}

// ─── Comprobantes al cliente — con la marca de quien emite ───────────────────
//
// Estos dos correos los recibe el cliente final (un padre de familia, un
// paciente, un comprador). Quien factura es el colegio o la empresa, no Zero:
// el remitente, el encabezado y el pie llevan sus datos, y responder al correo
// le escribe a ellos. El dominio de envío sí sigue siendo zero.com.do — es el
// único verificado ante el proveedor de correo.

/** Datos del emisor que se muestran en los correos al cliente. */
export type EmisorEmail = {
  razonSocial:      string;
  nombreComercial:  string | null;
  rnc:              string | null;
  direccion:        string | null;
  telefono:         string | null;
  sitioWeb:         string | null;
  emailFacturacion: string | null;
  /** data URL base64 — se adjunta inline y se referencia con cid: */
  logo:             string | null;
  colorPrimario:    string;
};

const CID_LOGO = 'logo-emisor';
/** Tope defensivo: el cliente ya limita el logo a ~800KB al subirlo. */
const LOGO_MAX_BYTES = 1_000_000;

/** Nombre visible del emisor: el comercial si lo tiene, si no la razón social. */
function nombreEmisor(emisor: EmisorEmail): string {
  return (emisor.nombreComercial?.trim() || emisor.razonSocial?.trim() || 'Facturación');
}

/**
 * Construye el `from`. El nombre va entre comillas y sin caracteres que puedan
 * partir la cabecera — un salto de línea en el nombre de una empresa permitiría
 * inyectar headers arbitrarios en el correo.
 */
function remitente(emisor: EmisorEmail): string {
  const limpio = nombreEmisor(emisor)
    .replace(/[\r\n"\\<>]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60);
  return `"${limpio || 'Facturación'}" <noreply@zero.com.do>`;
}

/** Convierte el data URL del logo en un adjunto inline. Null si no sirve. */
function logoInline(logo: string | null): { attachment: Attachment; img: string } | null {
  if (!logo) return null;
  const m = /^data:image\/(png|jpe?g|gif|webp);base64,(.+)$/i.exec(logo.trim());
  if (!m) return null;
  const ext = m[1].toLowerCase() === 'jpg' ? 'jpeg' : m[1].toLowerCase();
  const buf = Buffer.from(m[2], 'base64');
  if (buf.length === 0 || buf.length > LOGO_MAX_BYTES) return null;
  return {
    attachment: {
      filename:    `logo.${ext}`,
      content:     buf,
      contentType: `image/${ext}`,
      contentId:   CID_LOGO,
    },
    img: `<img src="cid:${CID_LOGO}" alt="" style="max-height:56px;max-width:200px;display:block;margin:0 auto 10px;">`,
  };
}

function montoDOP(centavos: number): string {
  return escapeHtml((centavos / 100).toLocaleString('es-DO', { minimumFractionDigits: 2 }));
}

/** Encabezado con el color, el logo y el nombre de la institución. */
function cabeceraEmisor(emisor: EmisorEmail, logoImg: string | null, etiqueta: string): string {
  const color = /^#[0-9a-f]{6}$/i.test(emisor.colorPrimario) ? emisor.colorPrimario : '#1e40af';
  return `
    <div style="background:${color};padding:24px 28px;text-align:center;">
      ${logoImg ?? ''}
      <p style="margin:0;color:#fff;font-size:18px;font-weight:700;">${escapeHtml(nombreEmisor(emisor))}</p>
      <p style="margin:6px 0 0;color:rgba(255,255,255,.75);font-size:12px;text-transform:uppercase;letter-spacing:.08em;">${escapeHtml(etiqueta)}</p>
    </div>`;
}

/** Pie con los datos fiscales y de contacto de la institución. */
function pieEmisor(emisor: EmisorEmail, motivo: string): string {
  const lineas = [
    emisor.razonSocial && emisor.nombreComercial ? escapeHtml(emisor.razonSocial) : null,
    emisor.rnc ? `RNC: ${escapeHtml(emisor.rnc)}` : null,
    emisor.direccion ? escapeHtml(emisor.direccion) : null,
    [
      emisor.telefono ? `Tel.: ${escapeHtml(emisor.telefono)}` : null,
      emisor.emailFacturacion ? escapeHtml(emisor.emailFacturacion) : null,
      emisor.sitioWeb ? escapeHtml(emisor.sitioWeb) : null,
    ].filter(Boolean).join(' · ') || null,
  ].filter(Boolean);

  return `
    <div style="background:#f9fafb;border-top:1px solid #e5e7eb;padding:18px 28px;">
      ${lineas.map(l => `<p style="margin:0 0 3px;font-size:12px;color:#6b7280;">${l}</p>`).join('')}
      <p style="margin:10px 0 0;font-size:11px;color:#9ca3af;">
        ${escapeHtml(motivo)} Si tienes alguna duda, responde a este mensaje.
      </p>
    </div>`;
}

/** Fila de la tabla de detalle. */
function fila(etiqueta: string, valor: string, destacada = false): string {
  const peso = destacada ? '700' : '600';
  const fondo = destacada ? 'background:#f9fafb;' : '';
  return `
    <tr style="${fondo}">
      <td style="padding:9px 14px;color:#6b7280;font-size:13px;border-bottom:1px solid #f3f4f6;">${etiqueta}</td>
      <td style="padding:9px 14px;text-align:right;font-size:13px;font-weight:${peso};color:#111827;border-bottom:1px solid #f3f4f6;">${valor}</td>
    </tr>`;
}

/**
 * Recordatorio de pago de una cuenta por cobrar.
 *
 * Tono neutro a propósito: es un aviso de saldo, no una gestión de cobro
 * agresiva. Quien decide el tono real es la empresa en el comentario interno,
 * no este correo.
 */
export async function sendRecordatorioCobroEmail(opts: {
  email:        string;
  cliente:      string;
  emisor:       string;
  documento:    string;
  saldoCents:   number;
  fechaLimite:  string | null;
  diasVencido:  number;
}) {
  const safeCliente = escapeHtml(opts.cliente);
  const safeEmisor  = escapeHtml(opts.emisor);
  const safeDoc     = escapeHtml(opts.documento);
  const safeSaldo   = escapeHtml(
    (opts.saldoCents / 100).toLocaleString('es-DO', { minimumFractionDigits: 2 }),
  );
  const vencida = opts.diasVencido > 0;
  const linea = vencida
    ? `Este documento venció hace ${opts.diasVencido} día${opts.diasVencido !== 1 ? 's' : ''}.`
    : opts.fechaLimite
      ? `Su fecha de vencimiento es el ${escapeHtml(opts.fechaLimite)}.`
      : '';

  await resend.emails.send({
    from: 'Zero <noreply@zero.com.do>',
    to: opts.email,
    subject: `Recordatorio de pago · ${opts.documento}`,
    html: `
      <div style="font-family: sans-serif; max-width: 520px; margin: 0 auto;">
        <h2 style="color:#2a45c4;">Recordatorio de pago</h2>
        <p>Estimado/a ${safeCliente},</p>
        <p>
          Le recordamos que el documento <strong>${safeDoc}</strong> tiene un
          saldo pendiente de <strong>DOP ${safeSaldo}</strong>. ${linea}
        </p>
        <p style="color:#6b7280;font-size:14px;">
          Si ya realizó el pago, por favor ignore este mensaje.
        </p>
        <p style="color:#6b7280;font-size:14px;">${safeEmisor}</p>
      </div>
    `,
  });
}

/** Envía la factura como PDF adjunto, con la marca de quien la emite. */
export async function sendInvoiceEmail(opts: {
  email:          string;
  encf:           string;
  codigo:         string | null;
  fechaEmision:   string;          // ya formateada para leer
  clienteNombre:  string | null;
  montoTotalCts:  number;
  saldoCts:       number;
  emisor:         EmisorEmail;
  pdfBuffer:      Buffer;
}) {
  const {
    email, encf, codigo, fechaEmision,
    clienteNombre, montoTotalCts, saldoCts, emisor, pdfBuffer,
  } = opts;

  const referencia = codigo ?? encf;
  const logo = logoInline(emisor.logo);
  const saldado = saldoCts <= 0;
  // Las facturas sin comprobante fiscal guardan un placeholder (BOR-XXXXXXXX)
  // en la misma columna. Solo se muestra el e-NCF cuando es uno de verdad.
  const encfReal = /^E\d{12}$/.test(encf) && encf !== referencia;
  // Una nota de crédito no es una factura; el código lo dice (NC-, ND-, FA-).
  const tipoTexto = /^NC-/i.test(referencia) ? 'Nota de crédito'
    : /^ND-/i.test(referencia) ? 'Nota de débito'
    : 'Factura';

  const html = `
    <div style="font-family:sans-serif;max-width:560px;margin:0 auto;background:#fff;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;">
      ${cabeceraEmisor(emisor, logo?.img ?? null, tipoTexto)}
      <div style="padding:28px;">
        <p style="margin:0 0 18px;color:#374151;font-size:15px;">
          ${clienteNombre ? `Estimado/a <strong>${escapeHtml(clienteNombre)}</strong>,` : 'Estimado/a cliente,'}
          adjuntamos el comprobante <strong>${escapeHtml(referencia)}</strong> en formato PDF.
        </p>
        <table style="width:100%;border-collapse:collapse;">
          ${fila('Comprobante', escapeHtml(referencia))}
          ${encfReal ? fila('e-NCF', escapeHtml(encf)) : ''}
          ${fila('Fecha', escapeHtml(fechaEmision))}
          ${fila('Total', `DOP ${montoDOP(montoTotalCts)}`, true)}
          ${saldado
            ? fila('Estado', '<span style="color:#15803d;">Pagada</span>')
            : fila('Pendiente', `<span style="color:#b45309;">DOP ${montoDOP(saldoCts)}</span>`)}
        </table>
      </div>
      ${pieEmisor(emisor, `Recibes este correo porque se emitió este documento a tu nombre.`)}
    </div>`;

  const attachments: Attachment[] = [{ filename: `${referencia}.pdf`, content: pdfBuffer }];
  if (logo) attachments.push(logo.attachment);

  const res = await resend.emails.send({
    from:    remitente(emisor),
    to:      email,
    replyTo: emisor.emailFacturacion ?? undefined,
    subject: `${tipoTexto} ${referencia} — ${nombreEmisor(emisor)}`,
    html,
    attachments,
  });
  assertSent(res, 'sendInvoiceEmail');
}

/** Envía la cotización como PDF adjunto, con la marca de quien la emite. */
export async function sendCotizacionEmail(opts: {
  email:            string;
  numero:           string;
  clienteNombre:    string | null;
  montoTotalCts:    number;
  fechaEmision:     string;
  fechaVencimiento: string | null;
  emisor:           EmisorEmail;
  pdfBuffer:        Buffer;
}) {
  const {
    email, numero, clienteNombre, montoTotalCts,
    fechaEmision, fechaVencimiento, emisor, pdfBuffer,
  } = opts;

  const logo = logoInline(emisor.logo);

  const html = `
    <div style="font-family:sans-serif;max-width:560px;margin:0 auto;background:#fff;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;">
      ${cabeceraEmisor(emisor, logo?.img ?? null, 'Cotización')}
      <div style="padding:28px;">
        <p style="margin:0 0 18px;color:#374151;font-size:15px;">
          ${clienteNombre ? `Estimado/a <strong>${escapeHtml(clienteNombre)}</strong>,` : 'Estimado/a cliente,'}
          adjuntamos la cotización <strong>${escapeHtml(numero)}</strong> en formato PDF.
        </p>
        <table style="width:100%;border-collapse:collapse;margin-bottom:20px;">
          ${fila('Cotización', escapeHtml(numero))}
          ${fila('Fecha', escapeHtml(fechaEmision))}
          ${fechaVencimiento ? fila('Válida hasta', escapeHtml(fechaVencimiento)) : ''}
          ${fila('Total', `DOP ${montoDOP(montoTotalCts)}`, true)}
        </table>
        <p style="margin:0;color:#6b7280;font-size:13px;">Gracias por su preferencia. Quedamos atentos a cualquier consulta.</p>
      </div>
      ${pieEmisor(emisor, `Recibes este correo porque se preparó esta cotización a tu nombre.`)}
    </div>`;

  const attachments: Attachment[] = [{ filename: `cotizacion-${numero}.pdf`, content: pdfBuffer }];
  if (logo) attachments.push(logo.attachment);

  const res = await resend.emails.send({
    from:    remitente(emisor),
    to:      email,
    replyTo: emisor.emailFacturacion ?? undefined,
    subject: `Cotización ${numero} — ${nombreEmisor(emisor)}`,
    html,
    attachments,
  });
  assertSent(res, 'sendCotizacionEmail');
}
