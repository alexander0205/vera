import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { signToken, verifyToken } from '@/lib/auth/session';
import {
  moduleForHost, esHostApp, esRutaDeCuenta, moduloDeRuta, hostDeModulo, MODULE_HOME,
} from '@/lib/config/modules';

const protectedRoutes = ['/dashboard', '/pos', '/cuenta', '/escolar'];

// Routing por subdominio (módulos del producto):
// pos.zero.com.do → /pos · facturacion.zero.com.do → /dashboard.
// moduleForHost vive en lib/config/modules.ts (testeable).

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const sessionCookie = request.cookies.get('session');

  const hostActual = request.headers.get('host');
  const mod = moduleForHost(hostActual);

  /**
   * La ruta que se va a SERVIR, que no siempre es la que pide el navegador.
   *
   * En los subdominios de módulo la raíz se sirve por rewrite: el navegador
   * pide `/` y se le entrega `/pos`. Comparar el guard contra `/` dejaba la
   * portada del POS, del panel y de colegios fuera de `protectedRoutes` —la
   * pantalla por la que entra todo el mundo—, y la única defensa que quedaba
   * era el guard de la propia página.
   *
   * Ese guard funciona (se comprobó: sin sesión el cuerpo llega vacío y con
   * un REDIRECT dentro), pero una capa que se apaga sola cuando cambia el
   * routing no es una capa. Resolver la ruta efectiva ANTES de mirar los
   * permisos deja el proxy comprobando lo que de verdad se va a servir.
   */
  const rutaServida = mod && pathname === '/' ? MODULE_HOME[mod] : pathname;
  const isProtectedRoute = protectedRoutes.some(p => rutaServida.startsWith(p));

  if (isProtectedRoute && !sessionCookie) {
    return NextResponse.redirect(new URL('/sign-in', request.url));
  }

  // ── Entrar, registrarse y configurar la cuenta viven en app.zero.com.do ──
  //
  // Todo esto está condicionado a que APP_HOST exista. Sin esa variable el
  // bloque entero no hace nada y la aplicación se comporta como siempre: es lo
  // que permite subir este código a producción sin mover nada, y encender los
  // subdominios después cambiando solo el entorno.
  //
  // La comparación contra `hostActual` no es de adorno: sin ella, un APP_HOST
  // mal escrito —que `esHostApp()` no reconociera— produciría una redirección
  // a sí mismo en bucle, y un bucle en /sign-in deja fuera a TODO el mundo,
  // incluido quien tendría que entrar a arreglarlo.
  const appHost = process.env.APP_HOST;
  if (appHost && esRutaDeCuenta(pathname) && !esHostApp(hostActual) && hostActual !== appHost) {
    const destino = new URL(request.url);
    destino.host = appHost;
    destino.protocol = 'https:';
    return NextResponse.redirect(destino);
  }

  // ── Y al revés: las rutas de módulo NO viven en app.zero.com.do ──────────
  //
  // Simétrico al bloque de arriba y por el mismo motivo. Tras entrar,
  // `redirect('/dashboard')` es una ruta RELATIVA, así que dejaba al usuario
  // en el host donde entró: el panel de facturación acababa sirviéndose en
  // app.zero.com.do, que solo debería tener entrar, registrarse y cuenta.
  //
  // Se arregla aquí y no en el `redirect` de la acción de login porque hay
  // más puertas que esa —el final del onboarding, un marcador viejo, el
  // enlace de un correo— y todas apuntan a rutas, que no saben de hosts.
  //
  // Igual que arriba, todo depende de que el host de destino esté configurado
  // y sea distinto del actual: sin `FACTURACION_HOST` esto no hace nada, y
  // nunca se redirige a sí mismo.
  // Y no solo desde `app.`: CADA ruta de módulo va a su host, venga de donde
  // venga. `pos.zero.com.do/dashboard/suscripcion` servía la pantalla de
  // suscripción —que es de Facturación— desde el host del punto de venta,
  // porque la regla de abajo solo mira `/dashboard` EXACTO y esta ruta tiene
  // cola. Cualquier enlace, marcador o correo con una ruta profunda entraba
  // por la puerta equivocada.
  //
  // `destino !== hostActual` es lo que evita el bucle y lo que hace que un
  // host sin configurar no haga nada.
  {
    const destino = hostDeModulo(moduloDeRuta(pathname));
    if (destino && destino !== hostActual) {
      const url = new URL(request.url);
      url.host = destino;
      url.protocol = 'https:';
      return NextResponse.redirect(url);
    }
  }

  // Home del módulo según el host. Solo se toca la raíz (y /dashboard exacto
  // en el host POS) — las rutas profundas quedan protegidas por los guards de
  // página/módulo, no por el proxy.
  //
  // La raíz va por REWRITE y no por redirect: `pos.zero.com.do` sirve el POS
  // sin que la barra acabe en `pos.zero.com.do/pos`, que era repetir el nombre
  // del módulo dos veces. El `/dashboard` del host POS sí sigue siendo un
  // redirect — ahí el usuario pidió otra cosa y hay que llevarlo, no
  // disimularlo.
  //
  // El precio del rewrite: para el navegador la ruta es `/`, así que
  // `usePathname()` devuelve `/` y no `/pos`. Quien resalta el menú o decide
  // el módulo del buscador ya no puede deducirlo de la URL, y por eso ahora se
  // lo pasamos como prop (ver `RailSecciones` y `GlobalSearch`). Sin esa parte
  // el rewrite deja el menú sin nada marcado al entrar.
  if (mod === 'pos') {
    if (pathname === '/') {
      return NextResponse.rewrite(new URL('/pos', request.url));
    }
    if (pathname === '/dashboard') {
      // Post-login genérico apunta a /dashboard; en el host POS el destino es /pos.
      return NextResponse.redirect(new URL('/pos', request.url));
    }
  } else if (mod === 'facturacion') {
    if (pathname === '/') {
      return NextResponse.rewrite(new URL('/dashboard', request.url));
    }
  } else if (mod === 'escolar') {
    // colegio.zero.com.do — el módulo se llama `escolar` por dentro.
    if (pathname === '/') {
      return NextResponse.rewrite(new URL('/escolar', request.url));
    }
    if (pathname === '/dashboard') {
      return NextResponse.redirect(new URL('/escolar', request.url));
    }
  } else if (esHostApp(hostActual) && pathname === '/') {
    // En el host de la cuenta la raíz no es un panel: es entrar o administrar.
    // Sin sesión, el guard de arriba ya habría mandado a /sign-in en las rutas
    // protegidas; aquí se decide para la raíz, que no lo es.
    return NextResponse.redirect(new URL(sessionCookie ? '/cuenta' : '/sign-in', request.url));
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
        // Debe coincidir con setSession: en dev (http://localhost) secure=true
        // hace que el navegador no reenvíe la cookie y la sesión se "cae".
        secure: process.env.NODE_ENV === 'production',
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
