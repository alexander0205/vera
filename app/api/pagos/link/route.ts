/**
 * POST /api/pagos/link — genera un link de pago para un e-CF o una cotización.
 *
 * Body: { ecfDocumentId } | { cotizacionId }
 * Requiere una pasarela ACTIVA en el team (payment_provider_config.enabled).
 * Cobra el SALDO PENDIENTE (no el total) para no sobre-cobrar facturas con abonos.
 *
 * Permiso: facturas:crear.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { and, eq, sql } from 'drizzle-orm';
import { requirePermission } from '@/lib/auth/api-guard';
import { db } from '@/lib/db/drizzle';
import { ecfDocuments, cotizaciones, pagosRecibidos, paymentLinks } from '@/lib/db/schema';
import { getActiveProvider, getProviderConfig, PROVIDERS } from '@/lib/pagos/config';
import { crearPaymentLink } from '@/lib/pagos/links';

const bodySchema = z.object({
  ecfDocumentId: z.number().int().positive().optional(),
  cotizacionId:  z.number().int().positive().optional(),
  /** Proveedor elegido en el modal. Si se omite, se usa el activo por prioridad. */
  provider:      z.enum(PROVIDERS).optional(),
}).refine((b) => !!b.ecfDocumentId !== !!b.cotizacionId, {
  message: 'Pasar exactamente uno de ecfDocumentId | cotizacionId',
});

export async function POST(req: NextRequest) {
  const auth = await requirePermission('facturas:crear');
  if (!auth.ok) return auth.response;
  const { teamId, user } = auth;

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Datos inválidos', detalle: parsed.error.flatten() }, { status: 400 });
  }

  // Proveedor: el elegido en el modal (si viene y está activo) o el activo por prioridad.
  let provider = parsed.data.provider
    ? await getProviderConfig(teamId, parsed.data.provider)
    : await getActiveProvider(teamId);
  if (provider && !provider.enabled) provider = null;
  if (!provider) {
    return NextResponse.json(
      { error: 'No hay pasarela de pago activa. Configúrala en Pagos › Pasarelas.' },
      { status: 409 },
    );
  }

  let montoCentavos = 0;
  let itbisCentavos = 0;

  if (parsed.data.ecfDocumentId) {
    const [doc] = await db.select({
      id: ecfDocuments.id, montoTotal: ecfDocuments.montoTotal, totalItbis: ecfDocuments.totalItbis,
      estado: ecfDocuments.estado, estadoPago: ecfDocuments.estadoPago,
    }).from(ecfDocuments)
      .where(and(eq(ecfDocuments.id, parsed.data.ecfDocumentId), eq(ecfDocuments.teamId, teamId)))
      .limit(1);
    if (!doc) return NextResponse.json({ error: 'Factura no encontrada' }, { status: 404 });
    if (doc.estado === 'ANULADO') return NextResponse.json({ error: 'La factura está anulada' }, { status: 409 });
    if (doc.estadoPago === 'PAGADO') return NextResponse.json({ error: 'La factura ya está pagada' }, { status: 409 });

    const [{ pagado }] = await db.select({
      pagado: sql<number>`coalesce(sum(${pagosRecibidos.montoCentavos}), 0)`,
    }).from(pagosRecibidos).where(eq(pagosRecibidos.ecfDocumentId, doc.id));

    montoCentavos = Math.max(0, doc.montoTotal - Number(pagado));
    itbisCentavos = doc.totalItbis;
    if (montoCentavos <= 0) return NextResponse.json({ error: 'No hay saldo pendiente' }, { status: 409 });
  } else {
    const [cot] = await db.select({
      id: cotizaciones.id, montoTotal: cotizaciones.montoTotal, totalItbis: cotizaciones.totalItbis, estado: cotizaciones.estado,
    }).from(cotizaciones)
      .where(and(eq(cotizaciones.id, parsed.data.cotizacionId!), eq(cotizaciones.teamId, teamId)))
      .limit(1);
    if (!cot) return NextResponse.json({ error: 'Cotización no encontrada' }, { status: 404 });
    if (cot.estado === 'pagada') return NextResponse.json({ error: 'La cotización ya está pagada' }, { status: 409 });

    montoCentavos = cot.montoTotal;
    itbisCentavos = cot.totalItbis;
    if (montoCentavos <= 0) return NextResponse.json({ error: 'La cotización no tiene monto' }, { status: 409 });
  }

  const link = await crearPaymentLink({
    teamId,
    provider:      provider.provider,
    ecfDocumentId: parsed.data.ecfDocumentId ?? null,
    cotizacionId:  parsed.data.cotizacionId ?? null,
    montoCentavos,
    itbisCentavos,
    createdBy:     user.id,
  });

  // Base = host real de la petición (funciona con autoPort en dev y detrás de
  // proxy en prod). NEXT_PUBLIC_APP_URL solo como fallback.
  const base = process.env.NEXT_PUBLIC_APP_URL || process.env.BASE_URL || new URL(req.url).origin;
  return NextResponse.json({
    token:    link.token,
    url:      `${base}/pay/${link.token}`,
    provider: provider.provider,
    montoCentavos,
    estado:   link.estado,
  });
}

/**
 * GET /api/pagos/link — lista los links de pago del team, con detalles del
 * documento/cliente para la pantalla "Links de pago". Permiso: pagos:ver.
 */
export async function GET(req: NextRequest) {
  const auth = await requirePermission('pagos:ver');
  if (!auth.ok) return auth.response;
  const { teamId } = auth;

  const base = process.env.NEXT_PUBLIC_APP_URL || process.env.BASE_URL || new URL(req.url).origin;

  const rows = await db.select({
    token:         paymentLinks.token,
    provider:      paymentLinks.provider,
    montoCentavos: paymentLinks.montoCentavos,
    estado:        paymentLinks.estado,
    providerRef:   paymentLinks.providerRef,
    createdAt:     paymentLinks.createdAt,
    paidAt:        paymentLinks.paidAt,
    expiresAt:     paymentLinks.expiresAt,
    ecfDocumentId: paymentLinks.ecfDocumentId,
    cotizacionId:  paymentLinks.cotizacionId,
    encf:          ecfDocuments.encf,
    docCliente:    ecfDocuments.razonSocialComprador,
    cotNumero:     cotizaciones.numero,
    cotCliente:    cotizaciones.razonSocialComprador,
  })
    .from(paymentLinks)
    .leftJoin(ecfDocuments, eq(paymentLinks.ecfDocumentId, ecfDocuments.id))
    .leftJoin(cotizaciones, eq(paymentLinks.cotizacionId, cotizaciones.id))
    .where(eq(paymentLinks.teamId, teamId))
    .orderBy(sql`${paymentLinks.createdAt} desc`)
    .limit(200);

  const links = rows.map((r) => ({
    token:         r.token,
    url:           `${base}/pay/${r.token}`,
    provider:      r.provider,
    montoCentavos: r.montoCentavos,
    estado:        r.expiresAt && r.estado === 'pendiente' && r.expiresAt < new Date() ? 'expirado' : r.estado,
    providerRef:   r.providerRef,
    createdAt:     r.createdAt,
    paidAt:        r.paidAt,
    documento:     r.encf ? `Factura ${r.encf}` : r.cotNumero ? `Cotización ${r.cotNumero}` : '—',
    cliente:       r.docCliente ?? r.cotCliente ?? '—',
  }));

  return NextResponse.json({ links });
}
