import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getSession } from '@/lib/auth/session';
import { clavesDeLaCookie, cookieDeNovedades, valorAlCerrar } from '@/lib/novedades';

/**
 * Marca como vistas las novedades que la persona acaba de cerrar.
 *
 * La cookie se pone AQUÍ y no desde el navegador por el dominio: cada módulo
 * vive en su subdominio y la sesión se comparte porque su cookie está en el
 * dominio raíz (`SESSION_COOKIE_DOMAIN`). Esta va en el mismo sitio; puesta
 * desde el navegador se quedaría en un solo subdominio y la ventana volvería a
 * salir al cambiar de módulo.
 *
 * No toca la base de datos: quién es sale de la sesión, y lo visto vive en la
 * cookie. No es `httpOnly` a propósito: la ventana la lee para decidir si se
 * abre. Solo guarda claves cortas de entradas públicas, nada de la persona.
 */
const cookieDomain = process.env.SESSION_COOKIE_DOMAIN
  ? { domain: process.env.SESSION_COOKIE_DOMAIN }
  : {};

const UN_ANIO = 60 * 60 * 24 * 400;

export async function POST(req: NextRequest) {
  const sesion = await getSession();
  const userId = Number(sesion?.user?.id);
  if (!Number.isInteger(userId) || userId <= 0) {
    return NextResponse.json({ error: 'Sin sesión' }, { status: 401 });
  }

  const cuerpo = await req.json().catch(() => null);
  const mostradas = Array.isArray(cuerpo?.claves)
    ? cuerpo.claves.filter((c: unknown): c is string => typeof c === 'string').slice(0, 100)
    : [];

  const jarra = await cookies();
  const nombre = cookieDeNovedades(userId);
  const valor = valorAlCerrar(clavesDeLaCookie(jarra.get(nombre)?.value), mostradas);

  jarra.set(nombre, valor, {
    maxAge: UN_ANIO,
    path: '/',
    httpOnly: false,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    ...cookieDomain,
  });
  return NextResponse.json({ ok: true });
}
