import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { headers } from 'next/headers';
import { resend, assertSent } from '@/lib/email';
import { rateLimit } from '@/lib/rate-limit';

const schema = z.object({
  nombre:   z.string().min(2).max(100),
  empresa:  z.string().min(2).max(200),
  email:    z.string().email(),
  telefono: z.string().max(30).optional().or(z.literal('')),
  mensaje:  z.string().min(10).max(2000),
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

  const { nombre, empresa, email, telefono, mensaje } = parsed.data;
  const safe = {
    nombre:   escapeHtml(nombre),
    empresa:  escapeHtml(empresa),
    email:    escapeHtml(email),
    telefono: escapeHtml(telefono ?? ''),
    mensaje:  escapeHtml(mensaje),
  };

  const destinatario = process.env.CONTACTO_EMAIL ?? 'hola@zero.com.do';

  try {
    const res = await resend.emails.send({
      from: 'Zero Contacto <noreply@zero.com.do>',
      to: destinatario,
      replyTo: email,
      subject: `Nueva solicitud de integración — ${empresa}`,
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #0f766e;">Nueva solicitud de integración</h2>
          <table style="width:100%;border-collapse:collapse;margin-top:16px;">
            <tr><td style="padding:6px 0;color:#6b7280;width:120px;">Nombre:</td><td><strong>${safe.nombre}</strong></td></tr>
            <tr><td style="padding:6px 0;color:#6b7280;">Empresa:</td><td><strong>${safe.empresa}</strong></td></tr>
            <tr><td style="padding:6px 0;color:#6b7280;">Email:</td><td><a href="mailto:${safe.email}">${safe.email}</a></td></tr>
            <tr><td style="padding:6px 0;color:#6b7280;">Teléfono:</td><td>${safe.telefono || '—'}</td></tr>
          </table>
          <h3 style="color:#374151;margin-top:24px;">Mensaje:</h3>
          <div style="background:#f9fafb;border-left:3px solid #0f766e;padding:12px 16px;border-radius:4px;white-space:pre-wrap;">${safe.mensaje}</div>
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
