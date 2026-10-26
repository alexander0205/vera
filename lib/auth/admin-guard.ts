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
