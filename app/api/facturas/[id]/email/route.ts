/**
 * POST /api/facturas/[id]/email
 * Envía la factura como PDF adjunto por email.
 *
 * El PDF se genera en proceso con `generarFacturaPdf`. Antes se pedía por HTTP a
 * `${NEXT_PUBLIC_APP_URL}/api/pdf/factura/[id]` reenviando la cookie: si esa URL
 * no era exactamente el mismo origen que sirve la app, el redirect descartaba la
 * cookie (fetch borra headers sensibles al cruzar de origen), el PDF volvía 401
 * y el correo nunca se enviaba.
 */
import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth/api-guard';
import { db } from '@/lib/db/drizzle';
import { ecfDocuments } from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';
import { sendInvoiceEmail } from '@/lib/email';
import { generarFacturaPdf } from '@/lib/pdf/generar';
import { rateLimit } from '@/lib/rate-limit';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermission('facturas:crear');
  if (!auth.ok) return auth.response;
  const { user, teamId } = auth;

  // Rate limit por user — 20/min — evita uso como SMTP relay
  const rl = rateLimit(`fact-email:${user.id}`, 20, 60_000);
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Demasiados envíos. Espera 1 minuto.' }, { status: 429 });
  }

  const { id } = await params;
  const doc = await db
    .select()
    .from(ecfDocuments)
    .where(and(eq(ecfDocuments.id, Number(id)), eq(ecfDocuments.teamId, teamId)))
    .limit(1);

  if (!doc[0]) return NextResponse.json({ error: 'Factura no encontrada' }, { status: 404 });

  const { email } = await req.json();
  const targetEmail = email || doc[0].emailComprador;
  if (!targetEmail) return NextResponse.json({ error: 'Email del cliente requerido' }, { status: 400 });

  let pdfBuffer: Buffer;
  try {
    const pdf = await generarFacturaPdf({ teamId, docId: doc[0].id });
    if (!pdf) return NextResponse.json({ error: 'Factura no encontrada' }, { status: 404 });
    pdfBuffer = pdf.buffer;
  } catch (e) {
    console.error('[factura email] Error generando PDF:', e);
    return NextResponse.json({ error: 'No se pudo generar el PDF' }, { status: 500 });
  }

  try {
    await sendInvoiceEmail(
      targetEmail,
      doc[0].encf,
      doc[0].razonSocialComprador ?? 'Cliente',
      doc[0].montoTotal,
      pdfBuffer,
    );
    return NextResponse.json({ success: true });
  } catch (e) {
    console.error('Error sending invoice email:', e);
    return NextResponse.json({ error: 'Error enviando email' }, { status: 500 });
  }
}
