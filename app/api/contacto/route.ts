import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { headers } from 'next/headers';
import { resend, assertSent } from '@/lib/email';
import { rateLimit } from '@/lib/rate-limit';

/**
 * Un solo buzón para las dos puertas de entrada: el formulario de integración
 * de `/integracion` y el «solicitar demo» del sitio público (`/contacto`).
 *
 * Los campos del sitio público son opcionales para que el formulario viejo
 * —que no los manda— siga funcionando igual. `mensaje` pasó a opcional por lo
 * mismo: en la demo el texto libre no es obligatorio, y exigir diez caracteres
 * de relleno solo consigue que escriban «hola» para poder enviar.
 */
const schema = z.object({
  nombre:   z.string().min(2).max(100),
  empresa:  z.string().min(2).max(200),
  email:    z.string().email(),
  telefono: z.string().max(30).optional().or(z.literal('')),
  mensaje:  z.string().max(2000).optional().or(z.literal('')),
  perfil:   z.enum(['pyme', 'colegio']).optional(),
  tamano:   z.string().max(60).optional(),
  temas:    z.array(z.string().max(60)).max(12).optional(),
});

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
}

export async function POST(req: NextRequest) {
  // Rate limit por IP — 3 envíos / 10 min (anti-spam)
  const reqHeaders = await headers();
  const ip = reqHeaders.get('x-forwarded-for') ?? 'unknown';
  const rl = rateLimit(`contacto:${ip}`, 3, 600_000);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Demasiados intentos. Intenta en 10 minutos.' },
      { status: 429 },
    );
  }

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 });
  }

  const { nombre, empresa, email, telefono, mensaje, perfil, tamano, temas } = parsed.data;
  const safe = {
    nombre:   escapeHtml(nombre),
    empresa:  escapeHtml(empresa),
    email:    escapeHtml(email),
    telefono: escapeHtml(telefono ?? ''),
    mensaje:  escapeHtml(mensaje ?? ''),
    tamano:   escapeHtml(tamano ?? ''),
    temas:    (temas ?? []).map(escapeHtml).join(', '),
  };

  // El perfil solo llega del sitio público; sin él es el formulario de
  // integración de siempre, y el asunto tiene que seguir diciendo eso para que
  // quien filtra el buzón no pierda la referencia.
  const esDemo = perfil !== undefined;
  const titulo = esDemo
    ? `Solicitud de demo — ${perfil === 'colegio' ? 'colegio' : 'pyme'}`
    : 'Nueva solicitud de integración';

  const destinatario = process.env.CONTACTO_EMAIL ?? 'hola@zero.com.do';

  try {
    const res = await resend.emails.send({
      from: 'Zero Contacto <noreply@zero.com.do>',
      to: destinatario,
      replyTo: email,
      subject: `${titulo} — ${empresa}`,
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #2a45c4;">${titulo}</h2>
          <table style="width:100%;border-collapse:collapse;margin-top:16px;">
            <tr><td style="padding:6px 0;color:#6b7280;width:120px;">Nombre:</td><td><strong>${safe.nombre}</strong></td></tr>
            <tr><td style="padding:6px 0;color:#6b7280;">${perfil === 'colegio' ? 'Colegio' : 'Empresa'}:</td><td><strong>${safe.empresa}</strong></td></tr>
            <tr><td style="padding:6px 0;color:#6b7280;">Email:</td><td><a href="mailto:${safe.email}">${safe.email}</a></td></tr>
            <tr><td style="padding:6px 0;color:#6b7280;">Teléfono:</td><td>${safe.telefono || '—'}</td></tr>
            ${safe.tamano ? `<tr><td style="padding:6px 0;color:#6b7280;">Tamaño:</td><td>${safe.tamano}</td></tr>` : ''}
            ${safe.temas ? `<tr><td style="padding:6px 0;color:#6b7280;">Le interesa:</td><td>${safe.temas}</td></tr>` : ''}
          </table>
          ${safe.mensaje
            ? `<h3 style="color:#374151;margin-top:24px;">Mensaje:</h3>
               <div style="background:#f9fafb;border-left:3px solid #2a45c4;padding:12px 16px;border-radius:4px;white-space:pre-wrap;">${safe.mensaje}</div>`
            : ''}
          <p style="color:#9ca3af;font-size:12px;margin-top:24px;">
            Enviado desde el formulario de contacto de Zero · IP: ${ip}
          </p>
        </div>
      `,
    });
    assertSent(res, 'contacto');
  } catch (e) {
    console.error('[contacto] resend error:', e);
    return NextResponse.json(
      { error: 'No se pudo enviar la solicitud. Intenta más tarde.' },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true });
}
