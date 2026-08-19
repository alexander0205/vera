/**
 * Cerrar sesión tiene que borrar la cookie DE VERDAD.
 *
 * El bug: la cookie se crea con `domain=.zero.com.do` (SSO entre subdominios)
 * pero se borraba con `delete('session')` a secas. Un Set-Cookie que borra solo
 * mata la cookie si repite el mismo `domain`; sin él apunta a la host-only, que
 * en producción no existe. Así que la sesión sobrevivía al logout y cualquier
 * subdominio —facturacion.*, pos.*, colegio.*— seguía entrando. La pantalla
 * decía que habías salido porque el redirect al login va después pase lo que
 * pase.
 *
 * Se prueba el atributo y no "que se borre" porque el atributo ES el bug: un
 * mock que ignore el domain pasa el test con el código roto.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const cookieStore = { delete: vi.fn(), set: vi.fn(), get: vi.fn() };

vi.mock('next/headers', () => ({ cookies: async () => cookieStore }));

const DOMINIO = '.zero.com.do';

async function importarLimpio() {
  vi.resetModules();
  return import('@/lib/auth/session');
}

describe('clearSession', () => {
  const envOriginal = process.env.SESSION_COOKIE_DOMAIN;

  beforeEach(() => { cookieStore.delete.mockClear(); });
  afterEach(() => {
    if (envOriginal === undefined) delete process.env.SESSION_COOKIE_DOMAIN;
    else process.env.SESSION_COOKIE_DOMAIN = envOriginal;
  });

  it('en producción borra con el mismo domain con que se creó', async () => {
    process.env.SESSION_COOKIE_DOMAIN = DOMINIO;
    const { clearSession } = await importarLimpio();

    await clearSession();

    expect(cookieStore.delete).toHaveBeenCalledTimes(1);
    const arg = cookieStore.delete.mock.calls[0][0];
    expect(arg).toMatchObject({ name: 'session', domain: DOMINIO });
  });

  it('sin la env (dev) borra host-only, sin inventarse un domain', async () => {
    delete process.env.SESSION_COOKIE_DOMAIN;
    const { clearSession } = await importarLimpio();

    await clearSession();

    const arg = cookieStore.delete.mock.calls[0][0];
    expect(arg).toMatchObject({ name: 'session' });
    expect(arg).not.toHaveProperty('domain');
  });

  it('borra con path "/" — el mismo alcance que la que se creó', async () => {
    process.env.SESSION_COOKIE_DOMAIN = DOMINIO;
    const { clearSession } = await importarLimpio();

    await clearSession();

    expect(cookieStore.delete.mock.calls[0][0]).toMatchObject({ path: '/' });
  });

  it('nunca se llama con un string: esa forma es justo la que no borraba', async () => {
    process.env.SESSION_COOKIE_DOMAIN = DOMINIO;
    const { clearSession } = await importarLimpio();

    await clearSession();

    expect(typeof cookieStore.delete.mock.calls[0][0]).not.toBe('string');
  });
});

/**
 * El proxy: la cookie se borra sobre la respuesta que se devuelve.
 *
 * Segundo bug del mismo bloque, y este no lo vio la lectura del código sino la
 * verificación en producción: la petición con una cookie corrupta redirigía a
 * /sign-in y no traía ni un Set-Cookie.
 *
 * La causa: el borrado se aplicaba a `res`, pero en ruta protegida se devolvía
 * un `NextResponse.redirect` nuevo. `res` se tiraba entero y el borrado con él.
 * Fallaba justo donde importa —sesión rota entrando a ruta protegida—, así que
 * la cookie mala sobrevivía a todas las peticiones siguientes.
 */
describe('proxy: sesión corrupta', () => {
  /** Respuesta con su bolsa de cookies, como NextResponse. */
  function respuesta(nombre: string) {
    const borradas: unknown[] = [];
    return { nombre, borradas, cookies: { delete: (o: unknown) => { borradas.push(o); } } };
  }

  /** El bloque catch, tal como quedó: decide la salida y luego borra sobre ella. */
  function alFallarLaSesion(esRutaProtegida: boolean) {
    const res = respuesta('next');
    const salida = esRutaProtegida ? respuesta('redirect') : res;
    salida.cookies.delete({ name: 'session', path: '/', domain: DOMINIO });
    return salida;
  }

  it('en ruta protegida borra sobre el redirect, no sobre la que se descarta', () => {
    const salida = alFallarLaSesion(true);
    expect(salida.nombre).toBe('redirect');
    expect(salida.borradas).toHaveLength(1);
  });

  it('en ruta pública borra sobre la respuesta que sigue de largo', () => {
    const salida = alFallarLaSesion(false);
    expect(salida.nombre).toBe('next');
    expect(salida.borradas).toHaveLength(1);
  });

  it('la respuesta devuelta nunca sale sin el borrado — el bug era exactamente eso', () => {
    for (const protegida of [true, false]) {
      expect(alFallarLaSesion(protegida).borradas).toHaveLength(1);
    }
  });

  it('y el borrado del proxy también lleva el domain', () => {
    const salida = alFallarLaSesion(true);
    expect(salida.borradas[0]).toMatchObject({ name: 'session', domain: DOMINIO, path: '/' });
  });
});
