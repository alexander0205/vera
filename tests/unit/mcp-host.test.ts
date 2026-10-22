/**
 * El host del conector (mcp.zero.com.do): cómo reparte el proxy sus rutas.
 *
 * `/mcp` tiene que llegar al conector (`/api/mcp`) con su método y su cuerpo, la
 * raíz y el resto tienen que llegar a la documentación (`/conector/…`), y nada
 * de eso puede pasar por el guard de sesión: es un sitio público. Los demás
 * hosts no se tocan.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { esHostMcp, destinoEnHostMcp } from '@/lib/config/modules';

// El proxy importa la sesión (jose + cookies de Next). Para estas pruebas basta
// con un verificador que no reconoce ninguna cookie.
vi.mock('@/lib/auth/session', () => ({
  signToken: vi.fn(async () => 'firmado'),
  verifyToken: vi.fn(async () => { throw new Error('cookie inválida'); }),
}));

const { proxy } = await import('@/proxy');

describe('esHostMcp', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('reconoce mcp.zero.com.do y mcp.localhost con puerto', () => {
    expect(esHostMcp('mcp.zero.com.do')).toBe(true);
    expect(esHostMcp('MCP.zero.com.do')).toBe(true);
    expect(esHostMcp('mcp.localhost:3216')).toBe(true);
  });

  it('no reconoce los demás hosts', () => {
    for (const h of ['app.zero.com.do', 'www.zero.com.do', 'zero.com.do', 'pos.zero.com.do', 'colegio.zero.com.do',
      'localhost:3000', 'agentes.localhost:3216', 'mcpx.zero.com.do', 'notmcp.zero.com.do', '', null, undefined]) {
      expect(esHostMcp(h), String(h)).toBe(false);
    }
  });

  it('acepta además el host fijado en MCP_HOST', () => {
    vi.stubEnv('MCP_HOST', 'conector.ejemplo.test');
    expect(esHostMcp('conector.ejemplo.test')).toBe(true);
    expect(esHostMcp('otro.ejemplo.test')).toBe(false);
  });
});

describe('destinoEnHostMcp', () => {
  it('/mcp va al conector', () => {
    expect(destinoEnHostMcp('/mcp')).toEqual({ accion: 'reescribir', ruta: '/api/mcp' });
    expect(destinoEnHostMcp('/mcp/')).toEqual({ accion: 'reescribir', ruta: '/api/mcp' });
  });

  it('la raíz y las demás páginas van a /conector', () => {
    expect(destinoEnHostMcp('/')).toEqual({ accion: 'reescribir', ruta: '/conector' });
    expect(destinoEnHostMcp('/herramientas')).toEqual({ accion: 'reescribir', ruta: '/conector/herramientas' });
    expect(destinoEnHostMcp('/llms.txt')).toEqual({ accion: 'reescribir', ruta: '/conector/llms.txt' });
    expect(destinoEnHostMcp('/server.json')).toEqual({ accion: 'reescribir', ruta: '/conector/server.json' });
    expect(destinoEnHostMcp('/index.md')).toEqual({ accion: 'reescribir', ruta: '/conector/index.md' });
    expect(destinoEnHostMcp('/robots.txt')).toEqual({ accion: 'reescribir', ruta: '/conector/robots.txt' });
    expect(destinoEnHostMcp('/sitemap.xml')).toEqual({ accion: 'reescribir', ruta: '/conector/sitemap.xml' });
  });

  it('el prefijo interno se quita con una redirección, no se duplica', () => {
    expect(destinoEnHostMcp('/conector')).toEqual({ accion: 'redirigir', ruta: '/' });
    expect(destinoEnHostMcp('/conector/seguridad')).toEqual({ accion: 'redirigir', ruta: '/seguridad' });
    // Una ruta que solo empieza parecido no es el prefijo.
    expect(destinoEnHostMcp('/conectores')).toEqual({ accion: 'reescribir', ruta: '/conector/conectores' });
  });

  it('los archivos estáticos y los íconos pasan tal cual', () => {
    for (const r of ['/marca/zero-horizontal-azul.svg', '/home/capturas/x.png', '/icon', '/icon?abc', '/apple-icon',
      '/manifest.webmanifest', '/icons/192', '/_next/static/x.js', '/api/mcp']) {
      expect(destinoEnHostMcp(r), r).toEqual({ accion: 'seguir' });
    }
  });
});

function pedir(host: string, ruta: string, init: { method?: string; cookie?: string } = {}) {
  const headers: Record<string, string> = { host };
  if (init.cookie) headers.cookie = init.cookie;
  return new NextRequest(`http://${host}${ruta}`, { method: init.method ?? 'GET', headers });
}

describe('el proxy en el host del conector', () => {
  beforeEach(() => {
    vi.stubEnv('APP_HOST', 'app.zero.com.do');
    vi.stubEnv('POS_HOST', '');
  });
  afterEach(() => vi.unstubAllEnvs());

  it('reescribe POST /mcp a /api/mcp (el método y el cuerpo los conserva la reescritura)', async () => {
    const res = await proxy(pedir('mcp.localhost:3216', '/mcp', { method: 'POST' }));
    expect(res.headers.get('x-middleware-rewrite')).toBe('http://mcp.localhost:3216/api/mcp');
    expect(res.status).toBe(200);
  });

  it('reescribe GET /mcp igual', async () => {
    const res = await proxy(pedir('mcp.zero.com.do', '/mcp'));
    expect(res.headers.get('x-middleware-rewrite')).toBe('http://mcp.zero.com.do/api/mcp');
  });

  it('reescribe la raíz y el resto a /conector, conservando la consulta', async () => {
    const raiz = await proxy(pedir('mcp.zero.com.do', '/'));
    expect(raiz.headers.get('x-middleware-rewrite')).toBe('http://mcp.zero.com.do/conector');

    const hs = await proxy(pedir('mcp.zero.com.do', '/herramientas?x=1'));
    expect(hs.headers.get('x-middleware-rewrite')).toBe('http://mcp.zero.com.do/conector/herramientas?x=1');

    const llms = await proxy(pedir('mcp.zero.com.do', '/llms.txt'));
    expect(llms.headers.get('x-middleware-rewrite')).toBe('http://mcp.zero.com.do/conector/llms.txt');
  });

  it('nunca manda al login ni toca la cookie de sesión, ni con una cookie rota', async () => {
    for (const ruta of ['/', '/mcp', '/herramientas', '/seguridad', '/llms.txt']) {
      const res = await proxy(pedir('mcp.zero.com.do', ruta, { cookie: 'session=cookie.vieja.invalida' }));
      expect(res.status, ruta).toBe(200);
      expect(res.headers.get('location'), ruta).toBeNull();
      expect(res.headers.get('set-cookie'), ruta).toBeNull();
    }
  });

  it('/conector pedido directo redirige a la ruta limpia', async () => {
    const res = await proxy(pedir('mcp.zero.com.do', '/conector/herramientas'));
    expect(res.status).toBe(308);
    expect(res.headers.get('location')).toBe('http://mcp.zero.com.do/herramientas');
  });

  it('un archivo estático pasa sin reescribir', async () => {
    const res = await proxy(pedir('mcp.zero.com.do', '/marca/zero-horizontal-azul.svg'));
    expect(res.headers.get('x-middleware-rewrite')).toBeNull();
    expect(res.headers.get('x-middleware-next')).toBe('1');
  });

  it('los otros hosts siguen como antes', async () => {
    // El sitio público no se reescribe.
    const www = await proxy(pedir('www.zero.com.do', '/agentes'));
    expect(www.headers.get('x-middleware-rewrite')).toBeNull();
    expect(www.headers.get('x-middleware-next')).toBe('1');

    // Una ruta protegida sigue mandando al login.
    const pos = await proxy(pedir('pos.zero.com.do', '/'));
    expect(pos.status).toBe(307);
    expect(pos.headers.get('location')).toContain('/sign-in');

    // La raíz de un módulo sigue reescribiéndose a su módulo, no al conector.
    const fact = await proxy(pedir('app.zero.com.do', '/'));
    expect(fact.headers.get('x-middleware-rewrite')).toBeNull();
  });
});
