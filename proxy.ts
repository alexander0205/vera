import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { signToken, verifyToken } from '@/lib/auth/session';

const protectedRoutes = ['/dashboard', '/pos'];

// ── Routing por subdominio (módulos del producto) ───────────────────────────
// pos.zero.com.do        → módulo POS        (home interna /pos)
// facturacion.zero.com.do→ módulo Facturación (home interna /dashboard)
// Detección: envs POS_HOST/FACTURACION_HOST exactos, o prefijo del hostname
// ("pos." / "facturacion.") para que pos.localhost:3000 funcione en dev.
type ModuleHost = 'pos' | 'facturacion' | null;

function moduleForHost(hostHeader: string | null): ModuleHost {
  if (!hostHeader) return null;
  const host = hostHeader.toLowerCase();
  const hostname = host.split(':')[0];
  if (process.env.POS_HOST && host === process.env.POS_HOST) return 'pos';
  if (process.env.FACTURACION_HOST && host === process.env.FACTURACION_HOST) return 'facturacion';
  if (hostname.startsWith('pos.')) return 'pos';
  if (hostname.startsWith('facturacion.')) return 'facturacion';
  return null;
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const sessionCookie = request.cookies.get('session');
  const isProtectedRoute = protectedRoutes.some(p => pathname.startsWith(p));

  if (isProtectedRoute && !sessionCookie) {
    return NextResponse.redirect(new URL('/sign-in', request.url));
  }

  // Home del módulo según el host. Solo se toca la raíz (y /dashboard exacto
  // en el host POS) — las rutas profundas quedan protegidas por los guards de
  // página/módulo, no por el proxy.
  const mod = moduleForHost(request.headers.get('host'));
  if (mod === 'pos') {
    if (pathname === '/') {
      return NextResponse.redirect(new URL('/pos', request.url));
    }
    if (pathname === '/dashboard') {
      // Post-login genérico apunta a /dashboard; en el host POS el destino es /pos.
      return NextResponse.redirect(new URL('/pos', request.url));
    }
  } else if (mod === 'facturacion') {
    if (pathname === '/') {
      return NextResponse.redirect(new URL('/dashboard', request.url));
    }
  }

  // Pasar el pathname como header para que los Server Components puedan leerlo
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-pathname', pathname);

  let res = NextResponse.next({ request: { headers: requestHeaders } });

  if (sessionCookie && request.method === 'GET') {
    try {
      const parsed = await verifyToken(sessionCookie.value);
      const expiresInOneDay = new Date(Date.now() + 24 * 60 * 60 * 1000);

      res.cookies.set({
        name: 'session',
        value: await signToken({
          ...parsed,
          expires: expiresInOneDay.toISOString()
        }),
        httpOnly: true,
        secure: true,
        sameSite: 'lax',
        expires: expiresInOneDay,
        // SSO entre subdominios (pos.* / facturacion.*): cookie a nivel de
        // dominio raíz en prod (ej. ".zero.com.do"). Sin env → host-only (dev).
        ...(process.env.SESSION_COOKIE_DOMAIN
          ? { domain: process.env.SESSION_COOKIE_DOMAIN }
          : {}),
      });
    } catch (error) {
      console.error('Error updating session:', error);
      res.cookies.delete('session');
      if (isProtectedRoute) {
        return NextResponse.redirect(new URL('/sign-in', request.url));
      }
    }
  }

  return res;
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
  runtime: 'nodejs'
};
