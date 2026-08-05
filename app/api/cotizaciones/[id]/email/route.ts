/**
 * POST /api/cotizaciones/[id]/email
 * Envía la cotización como PDF adjunto por email usando Resend.
 * Patrón idéntico a /api/facturas/[id]/email/route.ts: el PDF se genera en
 * proceso, sin pedirlo por HTTP a la propia app.
 */
import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth/api-guard';
import { db } from '@/lib/db/drizzle';
import { cotizaciones } from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';
import { sendCotizacionEmail } from '@/lib/email';
import { generarCotizacionPdf } from '@/lib/pdf/generar';
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

  let pdfBuffer: Buffer;
  try {
    const pdf = await generarCotizacionPdf({ teamId, cotId });
    if (!pdf) return NextResponse.json({ error: 'Cotización no encontrada' }, { status: 404 });
    pdfBuffer = pdf.buffer;
  } catch (e) {
    console.error('[cotizacion email] Error generando PDF:', e);
    return NextResponse.json({ error: 'No se pudo generar el PDF' }, { status: 500 });
  }

  try {
    await sendCotizacionEmail({
      email:            targetEmail,
      numero:           cot.numero,
      montoTotal:       cot.montoTotal,
      fechaVencimiento: cot.fechaVencimiento,
      pdfBuffer,
    });
    return NextResponse.json({ success: true });
  } catch (e) {
    console.error('[cotizacion email] Error:', e);
    return NextResponse.json({ error: 'Error enviando email' }, { status: 500 });
  }
}
