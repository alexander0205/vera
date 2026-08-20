import { compare, hash } from 'bcryptjs';
import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import { NewUser } from '@/lib/db/schema';

const key = new TextEncoder().encode(process.env.AUTH_SECRET);
const SALT_ROUNDS = 10;

// SSO entre subdominios de módulo (pos.* / facturacion.*): en prod la cookie
// vive en el dominio raíz (SESSION_COOKIE_DOMAIN=".zero.com.do"). Sin env →
// host-only (dev). Mismo valor que usa proxy.ts al refrescar la cookie.
const cookieDomain = process.env.SESSION_COOKIE_DOMAIN
  ? { domain: process.env.SESSION_COOKIE_DOMAIN }
  : {};

export async function hashPassword(password: string) {
  return hash(password, SALT_ROUNDS);
}

export async function comparePasswords(plainTextPassword: string, hashedPassword: string) {
  return compare(plainTextPassword, hashedPassword);
}

type SessionData = {
  user: { id: number };
  activeTeamId?: number;
  expires: string;
};

export async function signToken(payload: SessionData) {
  return await new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('1 day from now')
    .sign(key);
}

export async function verifyToken(input: string) {
  const { payload } = await jwtVerify(input, key, { algorithms: ['HS256'] });
  return payload as SessionData;
}

export async function getSession() {
  const session = (await cookies()).get('session')?.value;
  if (!session) return null;
  return await verifyToken(session);
}

/**
 * Borra la cookie de sesión. Cerrar sesión de verdad.
 *
 * Tiene que repetir el `domain` con el que se creó: una cookie solo se borra
 * si el Set-Cookie que la mata lleva el MISMO domain. `delete('session')` a
 * secas apunta a la cookie host-only, que en producción no existe —la nuestra
 * vive en `.zero.com.do` para el SSO entre subdominios—, así que la real
 * sobrevivía. Y como el redirect al login va después pase lo que pase, la
 * pantalla decía «cerraste sesión» mientras `facturacion.*` seguía entrando.
 *
 * Por eso está aquí y no repetido en cada sitio: el domain se decide una vez,
 * junto al que la crea.
 */
export async function clearSession() {
  (await cookies()).delete({ name: 'session', path: '/', ...cookieDomain });
}

export async function setSession(user: NewUser, activeTeamId?: number) {
  const expiresInOneDay = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const session: SessionData = {
    user: { id: user.id! },
    activeTeamId,
    expires: expiresInOneDay.toISOString(),
  };
  const encryptedSession = await signToken(session);
  (await cookies()).set('session', encryptedSession, {
    expires: expiresInOneDay,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    ...cookieDomain,
  });
}

/** Actualiza solo el activeTeamId en la sesión existente */
export async function setActiveTeam(teamId: number) {
  const session = await getSession();
  if (!session) return;
  const expiresInOneDay = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const updated: SessionData = {
    ...session,
    activeTeamId: teamId,
    expires: expiresInOneDay.toISOString(),
  };
  const encryptedSession = await signToken(updated);
  (await cookies()).set('session', encryptedSession, {
    expires: expiresInOneDay,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    ...cookieDomain,
  });
}
