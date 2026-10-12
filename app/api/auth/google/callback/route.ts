/**
 * La vuelta de Google.
 *
 * GET /api/auth/google/callback?code=…&state=…
 *
 * Tres desenlaces:
 *  · ya existe la cuenta        → sesión y adentro;
 *  · existe el correo sin atar  → se ata el `google_id` y adentro;
 *  · no existe                  → a /completar-registro con el perfil firmado,
 *                                 porque los Términos hay que aceptarlos y eso
 *                                 no se puede pedir dentro de Google.
 */

import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { users, teamMembers, teams } from '@/lib/db/schema';
import { setSession } from '@/lib/auth/session';
import { logActivity } from '@/lib/db/actividad';
import { ActivityType } from '@/lib/db/schema';
import { origenPublico } from '@/lib/http/origen-publico';
import { googleConfigurado, perfilDesdeCodigo, firmarPendiente, GoogleError } from '@/lib/auth/google';

function aError(req: NextRequest, motivo: string) {
  const url = new URL(`/sign-in?error=${motivo}`, origenPublico(req));
  return limpiar(NextResponse.redirect(url));
}

/** Las cookies de la ida ya cumplieron: se van, salga bien o mal. */
function limpiar(res: NextResponse) {
  res.cookies.delete('g_state');
  res.cookies.delete('g_destino');
  return res;
}

export async function GET(req: NextRequest) {
  if (!googleConfigurado()) return aError(req, 'google_no_disponible');

  const qs = req.nextUrl.searchParams;

  // El usuario pulsó «Cancelar» en la pantalla de Google. No es un fallo:
  // vuelve al login sin ruido.
  if (qs.get('error')) return limpiar(NextResponse.redirect(new URL('/sign-in', origenPublico(req))));

  const codigo = qs.get('code');
  const state  = qs.get('state');
  const esperado = req.cookies.get('g_state')?.value;

  // Anti-CSRF: sin esto, alguien puede provocar que la víctima complete un
  // login con la cuenta de Google del atacante y termine trabajando dentro de
  // ella sin darse cuenta.
  if (!codigo || !state || !esperado || state !== esperado) {
    return aError(req, 'google_state');
  }

  const base = origenPublico(req);

  let perfil;
  try {
    perfil = await perfilDesdeCodigo({ codigo, redirectUri: `${base}/api/auth/google/callback` });
  } catch (e) {
    console.error('[auth/google] no se pudo leer el perfil:', e);
    return aError(req, e instanceof GoogleError ? 'google_perfil' : 'google');
  }

  let destino: { redirect?: string; priceId?: string; inviteId?: string; inviteToken?: string } = {};
  try {
    destino = JSON.parse(req.cookies.get('g_destino')?.value || '{}');
  } catch { /* si viene rota, se entra al panel y ya */ }

  // Por `google_id` primero y por correo después: si la persona ya entró
  // alguna vez con Google, ese id manda aunque después le cambiaran el correo.
  const [porId] = await db.select().from(users).where(eq(users.googleId, perfil.googleId)).limit(1);
  const [porCorreo] = porId
    ? [undefined]
    : await db.select().from(users).where(eq(users.email, perfil.email)).limit(1);

  const usuario = porId ?? porCorreo;

  if (!usuario) {
    // Cuenta nueva: el perfil ya está verificado, pero falta que acepte los
    // Términos. Va firmado para que la pantalla siguiente no tenga que fiarse
    // de nada que mande el navegador.
    const token = await firmarPendiente({ ...perfil, ...destino });
    const url = new URL('/completar-registro', base);
    url.searchParams.set('t', token);
    return limpiar(NextResponse.redirect(url));
  }

  // 2FA: entrar por Google NO puede saltarse el segundo factor. Quien lo tiene
  // encendido decidió que su contraseña sola no basta, y aceptar Google aquí
  // sería justo la puerta de atrás que quiso cerrar. Se le manda al login
  // normal, que sí pide el código.
  if (usuario.twoFactorEnabled && usuario.twoFactorSecret) {
    return aError(req, 'google_2fa');
  }

  // Primera vez que este correo entra por Google: se ata el id para que las
  // siguientes veces no dependan del correo.
  if (!usuario.googleId) {
    await db.update(users).set({ googleId: perfil.googleId, updatedAt: new Date() })
      .where(eq(users.id, usuario.id));
  }

  const [pertenencia] = await db
    .select({ teamId: teams.id })
    .from(teamMembers)
    .leftJoin(teams, eq(teamMembers.teamId, teams.id))
    .where(eq(teamMembers.userId, usuario.id))
    .limit(1);

  await setSession(usuario);
  await logActivity(pertenencia?.teamId ?? undefined, usuario.id, ActivityType.SIGN_IN);

  const destinoFinal = usuario.platformRole === 'admin'
    ? '/admin'
    : (destino.redirect && destino.redirect !== 'checkout' ? destino.redirect : '/dashboard');

  return limpiar(NextResponse.redirect(new URL(destinoFinal, base)));
}
