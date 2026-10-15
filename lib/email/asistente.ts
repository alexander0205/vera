import { resend, assertSent } from '@/lib/email';

function escapeHtml(s: string | null | undefined): string {
  if (s == null) return '';
  return String(s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]!));
}

/**
 * Envía a quien lo programó su reporte del asistente, en PDF. Solo a la
 * dirección de esa persona (la ruta que programa no acepta otro destinatario).
 * Lanza si Resend falla: el cron lo anota y reintenta al día siguiente.
 */
export async function enviarReporteProgramadoEmail(opts: {
  email: string;
  nombre: string | null;
  empresa: string;
  titulo: string;
  fecha: string;
  pdf: Buffer;
  /** Enlace a la pantalla donde administrar los reportes programados. */
  urlGestion: string;
}): Promise<void> {
  const res = await resend.emails.send({
    from: 'Zero <noreply@zero.com.do>',
    to: opts.email,
    subject: `${opts.titulo} — ${opts.empresa}`,
    html: `
      <div style="font-family:sans-serif;max-width:520px;margin:0 auto;">
        <h2 style="color:#2a45c4;margin:0 0 12px;">${escapeHtml(opts.titulo)}</h2>
        <p>Hola${opts.nombre ? ` ${escapeHtml(opts.nombre)}` : ''},</p>
        <p>Adjuntamos el reporte que programaste para <strong>${escapeHtml(opts.empresa)}</strong>, generado el ${escapeHtml(opts.fecha)}.</p>
        <p style="color:#6b7280;font-size:13px;">
          Revisa las cifras importantes antes de decidir. Puedes cambiar o quitar este envío en
          <a href="${escapeHtml(opts.urlGestion)}">Historial del asistente › Reportes programados</a>.
        </p>
      </div>`,
    attachments: [{ filename: `${opts.titulo.replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-') || 'reporte'}.pdf`, content: opts.pdf }],
  });
  assertSent(res, 'enviarReporteProgramadoEmail');
}
