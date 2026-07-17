/**
 * POST /api/pagos/[token]/iniciar — arranca el pago del link.
 * Público (por token). Según el proveedor devuelve cómo continuar:
 *   - simulador → { mode: 'simulador' } (la landing muestra aprobar/rechazar)
 *   - cardnet   → { mode: 'redirect', action, session } (form auto-submit a CardNet)
 */

import { NextResponse } from 'next/server';
import { getLinkByToken, guardarSesion } from '@/lib/pagos/links';
import { getProviderConfig } from '@/lib/pagos/config';
import { resolveCardnetConfig, crearSesion, authorizeUrl } from '@/lib/pagos/cardnet';
import { resolveAzulConfig, buildPaymentPageForm } from '@/lib/pagos/azul';
import { db } from '@/lib/db/drizzle';
import { teams } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { logError } from '@/lib/logger';

export async function POST(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const reqOrigin = new URL(_req.url).origin;
  const link = await getLinkByToken(token);
  if (!link) return NextResponse.json({ error: 'Link no encontrado' }, { status: 404 });

  if (link.estado === 'pagado')   return NextResponse.json({ error: 'Este link ya fue pagado' }, { status: 409 });
  if (link.estado === 'expirado' || (link.expiresAt && link.expiresAt < new Date())) {
    return NextResponse.json({ error: 'El link expiró' }, { status: 409 });
  }

  const base = process.env.NEXT_PUBLIC_APP_URL || process.env.BASE_URL || reqOrigin;

  if (link.provider === 'simulador') {
    return NextResponse.json({ mode: 'simulador' });
  }

  if (link.provider === 'cardnet') {
    const cfgRow = await getProviderConfig(link.teamId, 'cardnet');
    const [team] = await db.select({ name: teams.name }).from(teams).where(eq(teams.id, link.teamId)).limit(1);
    const cfg = resolveCardnetConfig(cfgRow, team?.name ?? 'Comercio');
    if (!cfg) return NextResponse.json({ error: 'CardNet no está configurado' }, { status: 409 });

    try {
      const { session, sessionKey } = await crearSesion(cfg, {
        amountCentavos: link.montoCentavos,
        taxCentavos:    link.itbisCentavos,
        ordenId:        link.ordenId,
        transactionId:  String(link.id),
        returnUrl:      `${base}/api/pagos/callback/cardnet?token=${link.token}`,
        cancelUrl:      `${base}/api/pagos/callback/cardnet?token=${link.token}&cancel=1`,
      });
      await guardarSesion(link.id, session, sessionKey);
      // Form auto-submit: CardNet solo necesita el campo SESSION.
      return NextResponse.json({ mode: 'redirect', action: authorizeUrl(cfg.ambiente), fields: { SESSION: session } });
    } catch (e) {
      await logError({ teamId: link.teamId, source: 'pagos/iniciar',
        message: 'Fallo al crear sesión CardNet', details: { token, error: String(e) } });
      return NextResponse.json({ error: 'No se pudo iniciar el pago con CardNet. Verifica las credenciales.' }, { status: 502 });
    }
  }

  if (link.provider === 'azul') {
    const cfgRow = await getProviderConfig(link.teamId, 'azul');
    const [team] = await db.select({ name: teams.name }).from(teams).where(eq(teams.id, link.teamId)).limit(1);
    const cfg = resolveAzulConfig(cfgRow, team?.name ?? 'Comercio');
    if (!cfg) return NextResponse.json({ error: 'Azul no está configurado (faltan Auth1/Auth2)' }, { status: 409 });

    try {
      const cb = `${base}/api/pagos/callback/azul?token=${link.token}`;
      const { action, fields } = buildPaymentPageForm(cfg, {
        amountCentavos: link.montoCentavos,
        itbisCentavos:  link.itbisCentavos,
        orderNumber:    link.ordenId,
        approvedUrl:    cb,
        declinedUrl:    `${cb}&estado=declinado`,
        cancelUrl:      `${cb}&estado=cancelado`,
        responsePostUrl: cb,
      });
      // Azul: form multi-campo (todos los valores + AuthHash) → POST a Payment Page.
      return NextResponse.json({ mode: 'redirect', action, fields });
    } catch (e) {
      await logError({ teamId: link.teamId, source: 'pagos/iniciar',
        message: 'Fallo al armar form Azul', details: { token, error: String(e) } });
      return NextResponse.json({ error: 'No se pudo iniciar el pago con Azul. Verifica las credenciales.' }, { status: 502 });
    }
  }

  return NextResponse.json({ error: 'Proveedor no soportado aún' }, { status: 501 });
}
