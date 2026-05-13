import { Resend } from 'resend';

export const resend = new Resend(process.env.RESEND_API_KEY);

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
  await resend.emails.send({
    from: 'EmiteDO <noreply@yisraeltech.com>',
    to: email,
    subject: 'Restablecer contraseña — EmiteDO',
    html: `
      <div style="font-family: sans-serif; max-width: 500px; margin: 0 auto;">
        <h2 style="color: #0f766e;">Restablecer contraseña</h2>
        <p>Hola${safeName ? ` ${safeName}` : ''},</p>
        <p>Recibimos una solicitud para restablecer la contraseña de tu cuenta EmiteDO.</p>
        <p>
          <a href="${escapeHtml(resetUrl)}" style="background:#0f766e;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;display:inline-block;font-weight:600;">
            Restablecer contraseña
          </a>
        </p>
        <p style="color:#6b7280;font-size:14px;">Este enlace expira en 1 hora. Si no solicitaste este cambio, ignora este email.</p>
      </div>
    `,
  });
}

export async function sendEmailVerificationEmail(email: string, token: string, name: string | null) {
  const verifyUrl = `${process.env.NEXT_PUBLIC_APP_URL}/verify-email?token=${encodeURIComponent(token)}`;
  const safeName = escapeHtml(name);
  await resend.emails.send({
    from: 'EmiteDO <noreply@yisraeltech.com>',
    to: email,
    subject: 'Verificar tu email — EmiteDO',
    html: `
      <div style="font-family: sans-serif; max-width: 500px; margin: 0 auto;">
        <h2 style="color: #0f766e;">Verifica tu email</h2>
        <p>Hola${safeName ? ` ${safeName}` : ''},</p>
        <p>Gracias por registrarte en EmiteDO. Confirma tu dirección de email para comenzar.</p>
        <p>
          <a href="${escapeHtml(verifyUrl)}" style="background:#0f766e;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;display:inline-block;font-weight:600;">
            Verificar email
          </a>
        </p>
        <p style="color:#6b7280;font-size:14px;">Este enlace expira en 24 horas.</p>
      </div>
    `,
  });
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
  await resend.emails.send({
    from: 'EmiteDO <noreply@yisraeltech.com>',
    to: email,
    subject: `Invitación a ${teamName} en EmiteDO`,
    html: `
      <div style="font-family: sans-serif; max-width: 500px; margin: 0 auto;">
        <h2 style="color: #0f766e;">Te invitaron a ${safeTeam}</h2>
        <p>${safeInvitedBy} te ha invitado a colaborar en <strong>${safeTeam}</strong> en EmiteDO.</p>
        <p>
          <a href="${escapeHtml(acceptUrl)}" style="background:#0f766e;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;display:inline-block;font-weight:600;">
            Aceptar invitación
          </a>
        </p>
        <p style="color:#6b7280;font-size:14px;">Si no conoces a quien te invitó, puedes ignorar este email.</p>
      </div>
    `,
  });
}

export async function sendInvoiceEmail(
  email: string,
  encf: string,
  razonSocial: string,
  montoTotal: number,
  pdfBuffer: Buffer,
) {
  const safeEncf = escapeHtml(encf);
  const safeRazon = escapeHtml(razonSocial);
  const safeMonto = escapeHtml((montoTotal / 100).toLocaleString('es-DO', { minimumFractionDigits: 2 }));
  await resend.emails.send({
    from: 'EmiteDO <noreply@yisraeltech.com>',
    to: email,
    subject: `Factura ${encf}`,
    html: `
      <div style="font-family: sans-serif; max-width: 500px; margin: 0 auto;">
        <h2 style="color: #0f766e;">Factura ${safeEncf}</h2>
        <p>Adjuntamos la factura <strong>${safeEncf}</strong> por un monto de <strong>DOP ${safeMonto}</strong>.</p>
        <p style="color:#6b7280;font-size:14px;">Emitida por ${safeRazon}.</p>
      </div>
    `,
    attachments: [
      {
        filename: `${encf}.pdf`,
        content: pdfBuffer,
      },
    ],
  });
}
