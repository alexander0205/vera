import { Resend } from 'resend';

export const resend = new Resend(process.env.RESEND_API_KEY);

export async function sendPasswordResetEmail(email: string, token: string, name: string | null) {
  const resetUrl = `${process.env.NEXT_PUBLIC_APP_URL}/reset-password?token=${token}`;
  await resend.emails.send({
    from: 'EmiteDO <noreply@emitedo.com>',
    to: email,
    subject: 'Restablecer contraseña — EmiteDO',
    html: `
      <div style="font-family: sans-serif; max-width: 500px; margin: 0 auto;">
        <h2 style="color: #0f766e;">Restablecer contraseña</h2>
        <p>Hola${name ? ` ${name}` : ''},</p>
        <p>Recibimos una solicitud para restablecer la contraseña de tu cuenta EmiteDO.</p>
        <p>
          <a href="${resetUrl}" style="background:#0f766e;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;display:inline-block;font-weight:600;">
            Restablecer contraseña
          </a>
        </p>
        <p style="color:#6b7280;font-size:14px;">Este enlace expira en 1 hora. Si no solicitaste este cambio, ignora este email.</p>
      </div>
    `,
  });
}

export async function sendEmailVerificationEmail(email: string, token: string, name: string | null) {
  const verifyUrl = `${process.env.NEXT_PUBLIC_APP_URL}/verify-email?token=${token}`;
  await resend.emails.send({
    from: 'EmiteDO <noreply@emitedo.com>',
    to: email,
    subject: 'Verificar tu email — EmiteDO',
    html: `
      <div style="font-family: sans-serif; max-width: 500px; margin: 0 auto;">
        <h2 style="color: #0f766e;">Verifica tu email</h2>
        <p>Hola${name ? ` ${name}` : ''},</p>
        <p>Gracias por registrarte en EmiteDO. Confirma tu dirección de email para comenzar.</p>
        <p>
          <a href="${verifyUrl}" style="background:#0f766e;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;display:inline-block;font-weight:600;">
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
  const acceptUrl = `${process.env.NEXT_PUBLIC_APP_URL}/invitations/accept?token=${token}`;
  await resend.emails.send({
    from: 'EmiteDO <noreply@emitedo.com>',
    to: email,
    subject: `Invitación a ${teamName} en EmiteDO`,
    html: `
      <div style="font-family: sans-serif; max-width: 500px; margin: 0 auto;">
        <h2 style="color: #0f766e;">Te invitaron a ${teamName}</h2>
        <p>${invitedByName ?? 'Alguien'} te ha invitado a colaborar en <strong>${teamName}</strong> en EmiteDO.</p>
        <p>
          <a href="${acceptUrl}" style="background:#0f766e;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;display:inline-block;font-weight:600;">
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
  await resend.emails.send({
    from: 'EmiteDO <noreply@emitedo.com>',
    to: email,
    subject: `Factura ${encf}`,
    html: `
      <div style="font-family: sans-serif; max-width: 500px; margin: 0 auto;">
        <h2 style="color: #0f766e;">Factura ${encf}</h2>
        <p>Adjuntamos la factura <strong>${encf}</strong> por un monto de <strong>DOP ${(montoTotal / 100).toLocaleString('es-DO', { minimumFractionDigits: 2 })}</strong>.</p>
        <p style="color:#6b7280;font-size:14px;">Emitida por ${razonSocial}.</p>
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
