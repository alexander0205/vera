/**
 * GET /api/pagos/link/[token]/status — estado de un link de pago.
 * Público por token (el token ES el secreto). Usado por el dashboard (polling)
 * y por la landing. No expone datos sensibles del comercio.
 */

import { NextResponse } from 'next/server';
import { getLinkByToken, expirarLinksVencidos } from '@/lib/pagos/links';

export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const link = await getLinkByToken(token);
  if (!link) return NextResponse.json({ error: 'Link no encontrado' }, { status: 404 });

  // Marca expirados perezosamente.
  if (link.estado === 'pendiente' && link.expiresAt && link.expiresAt < new Date()) {
    await expirarLinksVencidos(link.teamId);
  }

  return NextResponse.json({
    estado:        link.estado === 'pendiente' && link.expiresAt && link.expiresAt < new Date() ? 'expirado' : link.estado,
    provider:      link.provider,
    montoCentavos: link.montoCentavos,
    itbisCentavos: link.itbisCentavos,
    currency:      link.currency,
    providerRef:   link.providerRef,
    cardMask:      link.cardMask,
    paidAt:        link.paidAt,
  });
}
