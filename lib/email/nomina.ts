import { resend, assertSent } from '@/lib/email';

/** Escapa para HTML (mismo criterio que lib/email/index.ts). */
function escapeHtml(s: string | null | undefined): string {
  if (s == null) return '';
  return String(s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]!));
}

/**
 * Envía al empleado el enlace para firmar su contrato en línea. La URL ya viene
 * armada con el token (la produce la ruta `enviar`). Lanza si Resend falla; el
 * llamador decide si eso rompe la petición o solo se anota.
 */
export async function enviarContratoFirmaEmail(opts: {
  email: string;
  empleadoNombre: string;
  empresaNombre: string;
  titulo: string;
  url: string;
}): Promise<void> {
  const nombre = escapeHtml(opts.empleadoNombre);
  const empresa = escapeHtml(opts.empresaNombre);
  const titulo = escapeHtml(opts.titulo);
  const url = escapeHtml(opts.url);

  const res = await resend.emails.send({
    from: 'Zero <noreply@zero.com.do>',
    to: opts.email,
    subject: `Firma tu contrato — ${opts.empresaNombre}`,
    html: `
      <div style="font-family: sans-serif; max-width: 520px; margin: 0 auto;">
        <h2 style="color:#2a45c4;">Tu contrato está listo para firmar</h2>
        <p>Hola${nombre ? ` ${nombre}` : ''},</p>
        <p><strong>${empresa}</strong> te envió un contrato para firmar: <em>${titulo}</em>.</p>
        <p>
          <a href="${url}" style="background:#2a45c4;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;display:inline-block;font-weight:600;">
            Revisar y firmar
          </a>
        </p>
        <p style="color:#6b7280;font-size:14px;">Si el botón no funciona, copia y pega este enlace en tu navegador:<br>${url}</p>
      </div>
    `,
  });
  assertSent(res, 'enviarContratoFirmaEmail');
}
