import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth/api-guard';
import { db } from '@/lib/db/drizzle';
import { ecfDocuments } from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';
import { sendInvoiceEmail } from '@/lib/email';
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

  // Fetch the PDF
  const pdfRes = await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/pdf/factura/${id}`, {
    headers: { cookie: req.headers.get('cookie') ?? '' },
  });
  if (!pdfRes.ok) return NextResponse.json({ error: 'No se pudo generar el PDF' }, { status: 500 });

  const pdfBuffer = Buffer.from(await pdfRes.arrayBuffer());

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
