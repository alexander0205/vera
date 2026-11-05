/**
 * Compuerta de las pantallas de `/admin`.
 *
 * NO basta con el `redirect()` del layout, y esto costó una fuga real: en el
 * App Router el layout y la página se renderizan A LA VEZ. El layout decidía
 * que no eras admin y redirigía, pero la página ya había consultado la base y
 * su resultado salía en el payload RSC. Sin sesión, desde internet, `/admin`
 * devolvía correos de usuarios y nombres de empresas de clientes.
 *
 * Por eso esto va como PRIMERA línea de cada página de admin, antes de tocar la
 * base: `redirect()` lanza, y entonces la consulta no llega a correr y no hay
 * nada que filtrar.
 *
 * El layout se queda igual —pinta la cabecera y también comprueba— pero la
 * defensa que cuenta es esta.
 */

import { redirect } from 'next/navigation';
import { NextResponse } from 'next/server';
import { getUser } from '@/lib/db/queries';

export async function exigirAdmin() {
  const user = await getUser();
  if (!user || user.platformRole !== 'admin') redirect('/dashboard');
  return user;
}

/**
 * Las rutas que CAMBIAN algo (POST, PUT, DELETE) solo aceptan peticiones que
 * nacieron en este mismo sitio. La cookie de sesión es `SameSite=Lax`, que ya
 * frena el envío desde otro sitio; esto es la segunda capa y no depende de
 * cómo la configure un navegador raro.
 *
 * Un navegador SIEMPRE manda `Origin` en un POST o DELETE de `fetch`, así que
 * sin `Origin` (ni `Sec-Fetch-Site: same-origin`) no se acepta: el panel no lo
 * usa ningún cliente que no sea un navegador. Con `Origin`, tienen que
 * coincidir el servidor y, si el proxy dice con qué protocolo llegó, también
 * el protocolo. El host reenviado (`x-forwarded-host`) solo lo pone el proxy de
 * la plataforma; en un despliegue sin proxy no existe y vale `Host`.
 */
export function origenValido(req: Request): boolean {
  const origin = req.headers.get('origin');
  if (origin) {
    const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host');
    const protocolo = req.headers.get('x-forwarded-proto')?.split(',')[0]?.trim();
    try {
      const o = new URL(origin);
      if (!host || o.host !== host) return false;
      return !protocolo || o.protocol === `${protocolo}:`;
    } catch { return false; }
  }
  return req.headers.get('sec-fetch-site') === 'same-origin';
}

/**
 * Lo mismo para una ruta /api/admin/*: en vez de redirigir, contesta 401/403.
 * Devuelve el usuario para dejar rastro de quién hizo el cambio.
 */
export async function requirePlatformAdmin() {
  const user = await getUser();
  if (!user) return { ok: false as const, response: NextResponse.json({ error: 'No autenticado' }, { status: 401 }) };
  if (user.platformRole !== 'admin') {
    return { ok: false as const, response: NextResponse.json({ error: 'Acceso restringido a administradores' }, { status: 403 }) };
  }
  return { ok: true as const, user };
}
