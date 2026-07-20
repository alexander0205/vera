/**
 * Callback de Azul Payment Page (ApprovedUrl / DeclinedUrl / CancelUrl / ResponsePostUrl).
 *   GET|POST /api/pagos/callback/azul?token=...
 *
 * Azul devuelve el resultado + su propio AuthHash. Verificamos la firma con
 * Auth1/Auth2 antes de confiar (verifyResponseHash) → nunca marcamos pagado por
 * el redirect solo. Luego marcarLinkPagado (idempotente, sin pérdida).
 */

import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { getLinkByToken, marcarLinkPagado } from '@/lib/pagos/links';
import { getProviderConfig } from '@/lib/pagos/config';
import { resolveAzulConfig, verifyResponseHash } from '@/lib/pagos/azul';
import { db } from '@/lib/db/drizzle';
import { teams } from '@/lib/db/schema';
import { logError } from '@/lib/logger';

async function handle(req: NextRequest) {
  const url   = new URL(req.url);
  const token = url.searchParams.get('token') ?? '';
  const base  = process.env.NEXT_PUBLIC_APP_URL || process.env.BASE_URL || url.origin;

  const link = await getLinkByToken(token);
  if (!link) return NextResponse.redirect(`${base}/pay/${token}/resultado`, 303);

  // Azul manda los campos por POST (form-urlencoded) y/o query. Unificamos.
  const params: Record<string, string> = {};
  url.searchParams.forEach((v, k) => { params[k] = v; });
  if (req.method === 'POST') {
    try {
      const form = await req.formData();
      form.forEach((v, k) => { params[k] = String(v); });
    } catch { /* sin body */ }
  }

  const cancelado = (params.estado === 'cancelado') || (url.searchParams.get('estado') === 'cancelado');
  if (cancelado) {
    return NextResponse.redirect(`${base}/pay/${token}/resultado?estado=cancelado`, 303);
  }

  try {
    const cfgRow = await getProviderConfig(link.teamId, 'azul');
    const [team] = await db.select({ name: teams.name }).from(teams).where(eq(teams.id, link.teamId)).limit(1);
    const cfg = resolveAzulConfig(cfgRow, team?.name ?? 'Comercio');
    if (cfg) {
      const res = verifyResponseHash(cfg, params);
      if (!res.hashValido) {
        await logError({ teamId: link.teamId, source: 'pagos/callback/azul',
          message: 'AuthHash de respuesta Azul inválido — posible manipulación', details: { token } });
      }
      await marcarLinkPagado(token, {
        aprobado:    res.aprobado, // exige hash válido + IsoCode 00
        providerRef: res.authorizationCode ?? res.rrn ?? null,
        cardMask:    res.cardMask,
      });
    }
  } catch (e) {
    await logError({ teamId: link.teamId, source: 'pagos/callback/azul',
      message: 'Fallo procesando callback Azul', details: { token, error: String(e) } });
  }

  return NextResponse.redirect(`${base}/pay/${token}/resultado`, 303);
}

export const GET  = handle;
export const POST = handle;
