/**
 * Callback de CardNet (ReturnUrl / CancelUrl).
 *   GET|POST /api/pagos/callback/cardnet?token=...[&cancel=1]
 *
 * NO confiamos en los parámetros del redirect del browser: consultamos la sesión
 * server-side (GET /sessions/{id}?sk=) que es la fuente de verdad autoritativa.
 * Luego marcamos el link (idempotente, sin pérdida) y redirigimos al resultado.
 */

import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { getLinkByToken, marcarLinkPagado } from '@/lib/pagos/links';
import { getProviderConfig } from '@/lib/pagos/config';
import { resolveCardnetConfig, consultarSesion } from '@/lib/pagos/cardnet';
import { db } from '@/lib/db/drizzle';
import { teams } from '@/lib/db/schema';
import { logError } from '@/lib/logger';

async function handle(req: NextRequest) {
  const url    = new URL(req.url);
  const token  = url.searchParams.get('token') ?? '';
  const cancel = url.searchParams.get('cancel') === '1';
  // Base = host real de la petición (autoPort en dev / proxy en prod). Sin esto
  // el redirect iba a NEXT_PUBLIC_APP_URL (localhost:3000) → 404 en dev.
  const base   = process.env.NEXT_PUBLIC_APP_URL || process.env.BASE_URL || url.origin;

  const link = await getLinkByToken(token);
  if (!link) return NextResponse.redirect(`${base}/pay/${token}/resultado`, 303);

  if (cancel) {
    // Cancelación del usuario: el link sigue reintentable, no lo marcamos fallido.
    return NextResponse.redirect(`${base}/pay/${token}/resultado?estado=cancelado`, 303);
  }

  try {
    const cfgRow = await getProviderConfig(link.teamId, 'cardnet');
    const [team] = await db.select({ name: teams.name }).from(teams).where(eq(teams.id, link.teamId)).limit(1);
    const cfg = resolveCardnetConfig(cfgRow, team?.name ?? 'Comercio');
    if (cfg && link.sessionId && link.sessionKey) {
      const res = await consultarSesion(cfg, link.sessionId, link.sessionKey);
      await marcarLinkPagado(token, {
        aprobado:    res.aprobado,
        providerRef: res.authorizationCode ?? res.retrievalRef ?? null,
        cardMask:    res.cardMask,
      });
    }
  } catch (e) {
    // No perdemos el pago: si la consulta falla, el link queda reintentable y se
    // registra el error para reconciliación posterior.
    await logError({ teamId: link.teamId, source: 'pagos/callback/cardnet',
      message: 'Fallo al verificar sesión CardNet', details: { token, error: String(e) } });
  }

  return NextResponse.redirect(`${base}/pay/${token}/resultado`, 303);
}

export const GET  = handle;
export const POST = handle;
