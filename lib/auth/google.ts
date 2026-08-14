/**
 * Login y registro con Google — OAuth2 «Authorization Code», escrito a mano.
 *
 * Sin librería a propósito: son dos llamadas HTTP (canjear el código y leer el
 * perfil) y el proyecto ya resuelve su propia sesión con `jose` en
 * lib/auth/session.ts. Meter NextAuth solo por esto obligaría a migrar toda la
 * sesión que ya existe, que es mucho más riesgo que estas cien líneas.
 */

import { SignJWT, jwtVerify, decodeJwt } from 'jose';

const AUTORIZAR = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN     = 'https://oauth2.googleapis.com/token';

const clave = () => new TextEncoder().encode(process.env.AUTH_SECRET);

export function googleConfigurado() {
  return !!process.env.GOOGLE_CLIENT_ID && !!process.env.GOOGLE_CLIENT_SECRET;
}

/** Lo que Google nos cuenta de la persona, ya limpio. */
export type PerfilGoogle = {
  googleId: string;
  email: string;
  nombre: string;
};

/**
 * A dónde mandamos al usuario para que Google le pregunte.
 *
 * `prompt=select_account` y no `consent`: quien tiene tres cuentas de Google
 * abiertas en el navegador necesita elegir con cuál entra, pero volver a pedir
 * permisos que ya dio en cada login es ruido.
 *
 * `access_type=online` porque no queremos refresh token: solo identificamos a
 * la persona una vez y cerramos. Guardar un token de larga vida que no vamos a
 * usar es guardar un problema.
 */
export function urlDeConsentimiento({ redirectUri, state }: { redirectUri: string; state: string }) {
  const url = new URL(AUTORIZAR);
  url.searchParams.set('client_id', process.env.GOOGLE_CLIENT_ID!);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', 'openid email profile');
  url.searchParams.set('access_type', 'online');
  url.searchParams.set('prompt', 'select_account');
  url.searchParams.set('state', state);
  return url.toString();
}

export class GoogleError extends Error {}

/**
 * Canjea el código por el perfil.
 *
 * El `id_token` viene de una llamada NUESTRA al servidor de Google por TLS, no
 * del navegador, así que no hace falta verificar su firma: no hay nadie en
 * medio que lo pueda haber fabricado. Por eso `decodeJwt` y no `jwtVerify` —
 * verificarlo exigiría descargar y rotar las claves públicas de Google para no
 * ganar nada.
 */
export async function perfilDesdeCodigo(
  { codigo, redirectUri }: { codigo: string; redirectUri: string },
): Promise<PerfilGoogle> {
  const res = await fetch(TOKEN, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code: codigo,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  });

  if (!res.ok) {
    throw new GoogleError(`Google rechazó el código (HTTP ${res.status})`);
  }

  const datos = (await res.json()) as { id_token?: string };
  if (!datos.id_token) throw new GoogleError('Google no devolvió id_token');

  const t = decodeJwt(datos.id_token) as {
    sub?: string; email?: string; email_verified?: boolean | string; name?: string;
  };

  if (!t.sub || !t.email) throw new GoogleError('El perfil de Google viene incompleto');

  // Un correo SIN verificar no vale para identificar a nadie: cualquiera puede
  // crear una cuenta de Google diciendo que es dueño de un correo ajeno, y si
  // lo aceptáramos entraría a la cuenta de esa persona. Google lo manda como
  // booleano o como la cadena "true" según el caso.
  if (t.email_verified !== true && t.email_verified !== 'true') {
    throw new GoogleError('Google no tiene ese correo verificado');
  }

  return {
    googleId: t.sub,
    email: t.email.trim().toLowerCase(),
    nombre: (t.name ?? '').trim().slice(0, 100),
  };
}

/**
 * Cuenta nueva por Google: qué se le pide y por qué se firma.
 *
 * El checkbox de Términos no se puede pedir en medio de la redirección de
 * Google, así que el perfil YA VERIFICADO se firma en un token de 10 minutos y
 * se manda a una pantalla mínima a aceptarlos. Esa pantalla nunca vuelve a
 * mandar el correo ni el id por su cuenta: todo lo sensible sale de este
 * token, no de lo que el navegador quiera poner en el POST.
 */
export type PerfilPendiente = PerfilGoogle & {
  redirect?: string;
  priceId?: string;
  inviteId?: string;
  inviteToken?: string;
};

export async function firmarPendiente(perfil: PerfilPendiente) {
  return new SignJWT({ ...perfil })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('10 min from now')
    .sign(clave());
}

export async function leerPendiente(token: string): Promise<PerfilPendiente> {
  const { payload } = await jwtVerify(token, clave(), { algorithms: ['HS256'] });
  return payload as unknown as PerfilPendiente;
}
