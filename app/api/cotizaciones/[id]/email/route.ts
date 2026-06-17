/**
 * POST /api/cotizaciones/[id]/email
 * Envía la cotización como PDF adjunto por email usando Resend.
 * Patrón idéntico a /api/facturas/[id]/email/route.ts.
 */
import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth/api-guard';
import { db } from '@/lib/db/drizzle';
import { cotizaciones } from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';
import { resend } from '@/lib/email';
import { rateLimit } from '@/lib/rate-limit';

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Ctx) {
  const auth = await requirePermission('cotizaciones:gestionar');
  if (!auth.ok) return auth.response;
  const { user, teamId } = auth;

  // Rate limit: 20/min por usuario
  const rl = rateLimit(`cot-email:${user.id}`, 20, 60_000);
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Demasiados envíos. Espera 1 minuto.' }, { status: 429 });
  }

  const { id } = await params;
  const cotId = parseInt(id);
  if (isNaN(cotId)) return NextResponse.json({ error: 'ID inválido' }, { status: 400 });

  const [cot] = await db
    .select()
    .from(cotizaciones)
    .where(and(eq(cotizaciones.id, cotId), eq(cotizaciones.teamId, teamId)))
    .limit(1);

  if (!cot) return NextResponse.json({ error: 'Cotización no encontrada' }, { status: 404 });

  const { email } = await req.json();
  const targetEmail = email || cot.emailComprador;
  if (!targetEmail) {
    return NextResponse.json({ error: 'Email del cliente requerido' }, { status: 400 });
  }

  // Generar PDF llamando a la ruta interna
  const pdfRes = await fetch(
    `${process.env.NEXT_PUBLIC_APP_URL}/api/pdf/cotizacion/${cotId}`,
    { headers: { cookie: req.headers.get('cookie') ?? '' } },
  );
  if (!pdfRes.ok) {
    return NextResponse.json({ error: 'No se pudo generar el PDF' }, { status: 500 });
  }

  const pdfBuffer = Buffer.from(await pdfRes.arrayBuffer());
  const monto = (cot.montoTotal / 100).toLocaleString('es-DO', { minimumFractionDigits: 2 });

  try {
    await resend.emails.send({
      from:    'EmiteDO <noreply@yisraeltech.com>',
      to:      targetEmail,
      subject: `Cotización ${cot.numero}`,
      html: `
        <div style="font-family: sans-serif; max-width: 500px; margin: 0 auto;">
          <h2 style="color: #0f766e;">Cotización ${cot.numero}</h2>
          <p>Adjuntamos la cotización <strong>${cot.numero}</strong> por un monto de <strong>DOP ${monto}</strong>.</p>
          ${cot.fechaVencimiento
            ? `<p style="color:#6b7280;font-size:14px;">Válida hasta: ${new Date(cot.fechaVencimiento).toLocaleDateString('es-DO', { year: 'numeric', month: 'long', day: 'numeric' })}.</p>`
            : ''}
          <p style="color:#6b7280;font-size:14px;">Gracias por su preferencia.</p>
        </div>
      `,
      attachments: [
        {
          filename: `cotizacion-${cot.numero}.pdf`,
          content:  pdfBuffer,
        },
      ],
    });

    return NextResponse.json({ success: true });
  } catch (e) {
    console.error('[cotizacion email] Error:', e);
    return NextResponse.json({ error: 'Error enviando email' }, { status: 500 });
  }
}
