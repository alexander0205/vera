/**
 * Arranca el login/registro con Google.
 *
 * GET /api/auth/google?redirect=…&priceId=…&inviteId=…&inviteToken=…
 *
 * Manda a la pantalla de consentimiento de Google y deja dos cosas guardadas
 * en cookies de vida corta: el `state` anti-CSRF y a dónde queríamos ir. El
 * destino NO viaja dentro del `state` porque el `state` solo tiene un trabajo
 * —demostrar que la vuelta corresponde a una ida nuestra— y mezclarle datos
 * lo convierte en un canal que hay que empezar a validar.
 */

import { NextRequest, NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import { origenPublico } from '@/lib/http/origen-publico';
import { googleConfigurado, urlDeConsentimiento } from '@/lib/auth/google';

/** Ida y vuelta por Google: diez minutos sobra y limita la ventana de reuso. */
const VIDA_SEGUNDOS = 600;

export async function GET(req: NextRequest) {
  if (!googleConfigurado()) {
    return NextResponse.redirect(new URL('/sign-in?error=google_no_disponible', req.url));
  }

  const base = origenPublico(req);
  const redirectUri = `${base}/api/auth/google/callback`;
  const state = randomBytes(24).toString('hex');

  const entrada = req.nextUrl.searchParams;
  const destino = JSON.stringify({
    redirect:    entrada.get('redirect')    || undefined,
    priceId:     entrada.get('priceId')     || undefined,
    inviteId:    entrada.get('inviteId')    || undefined,
    inviteToken: entrada.get('inviteToken') || undefined,
  });

  const res = NextResponse.redirect(urlDeConsentimiento({ redirectUri, state }));

  const comun = {
    httpOnly: true,
    // En desarrollo se entra por http desde el teléfono; forzar `secure` ahí
    // haría que el navegador tirara la cookie y el state nunca cuadraría.
    secure: base.startsWith('https://'),
    // `lax` y no `strict`: la vuelta de Google es una navegación de primer
    // nivel desde otro sitio, y con `strict` el navegador no manda la cookie.
    sameSite: 'lax' as const,
    path: '/',
    maxAge: VIDA_SEGUNDOS,
  };

  res.cookies.set('g_state', state, comun);
  res.cookies.set('g_destino', destino, comun);

  return res;
}
