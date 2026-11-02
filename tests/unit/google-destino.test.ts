// La entrada con Google de punta a punta: lo que se guarda en la ida y a dónde
// se redirige en la vuelta. Google y la base van simulados.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

type Fila = Record<string, unknown>;

/** Lo que devuelve cada `.limit(1)`, en orden. */
let respuestas: Fila[][] = [];
const firmados: Fila[] = [];

vi.mock('@/lib/db/drizzle', () => {
  const consulta = () => {
    const cadena = {
      from: () => cadena,
      leftJoin: () => cadena,
      where: () => cadena,
      limit: () => Promise.resolve(respuestas.shift() ?? []),
    };
    return cadena;
  };
  return {
    db: {
      select: consulta,
      update: () => ({ set: () => ({ where: () => Promise.resolve() }) }),
    },
  };
});

vi.mock('@/lib/auth/google', () => ({
  GoogleError: class extends Error {},
  googleConfigurado: () => true,
  urlDeConsentimiento: () => 'https://accounts.google.com/o/oauth2/v2/auth?client_id=x',
  perfilDesdeCodigo: () => Promise.resolve({ googleId: 'g-1', email: 'real@ejemplo.invalid', nombre: 'Real' }),
  firmarPendiente: (perfil: Fila) => { firmados.push(perfil); return Promise.resolve('token-firmado'); },
}));

vi.mock('@/lib/auth/session', () => ({ setSession: () => Promise.resolve() }));
vi.mock('@/lib/db/actividad', () => ({ logActivity: () => Promise.resolve() }));

const { GET: ida } = await import('@/app/api/auth/google/route');
const { GET: vuelta } = await import('@/app/api/auth/google/callback/route');

const BASE = 'https://app.zero.com.do';

async function guardadoEnLaIda(redirect: string) {
  const res = await ida(new NextRequest(`${BASE}/api/auth/google?redirect=${encodeURIComponent(redirect)}`));
  return JSON.parse(res.cookies.get('g_destino')!.value) as Fila;
}

function pedirVuelta(destino: unknown) {
  return vuelta(new NextRequest(`${BASE}/api/auth/google/callback?code=c&state=s`, {
    headers: { cookie: `g_state=s; g_destino=${encodeURIComponent(JSON.stringify(destino))}` },
  }));
}

const yaExiste = (over: Fila = {}) => {
  respuestas = [[{ id: 1, googleId: 'g-1', platformRole: 'member', twoFactorEnabled: false, ...over }], [{ teamId: 9 }]];
};

beforeEach(() => {
  respuestas = [];
  firmados.length = 0;
});

describe('la ida a Google', () => {
  it('no guarda un destino de otro sitio', async () => {
    for (const fuera of ['https://ejemplo.invalid', '//ejemplo.invalid', '/\\ejemplo.invalid']) {
      expect(await guardadoEnLaIda(fuera)).not.toHaveProperty('redirect');
    }
  });

  it('guarda las rutas internas y «checkout»', async () => {
    expect((await guardadoEnLaIda('/dashboard/soporte')).redirect).toBe('/dashboard/soporte');
    expect((await guardadoEnLaIda('checkout')).redirect).toBe('checkout');
  });
});

describe('la vuelta de Google', () => {
  it('con una cookie de otro sitio se queda en el panel', async () => {
    for (const fuera of ['https://ejemplo.invalid', '//ejemplo.invalid', '/\t/ejemplo.invalid']) {
      yaExiste();
      const res = await pedirVuelta({ redirect: fuera });
      expect(res.headers.get('location')).toBe(`${BASE}/dashboard`);
    }
  });

  it('respeta una ruta interna', async () => {
    yaExiste();
    const res = await pedirVuelta({ redirect: '/dashboard/soporte' });
    expect(res.headers.get('location')).toBe(`${BASE}/dashboard/soporte`);
  });

  it('«checkout» sigue cayendo en el panel', async () => {
    yaExiste();
    const res = await pedirVuelta({ redirect: 'checkout' });
    expect(res.headers.get('location')).toBe(`${BASE}/dashboard`);
  });

  it('el administrador va a /admin, traiga lo que traiga', async () => {
    yaExiste({ platformRole: 'admin' });
    const res = await pedirVuelta({ redirect: '/dashboard/soporte' });
    expect(res.headers.get('location')).toBe(`${BASE}/admin`);
  });

  it('quien tiene 2FA sigue sin poder entrar por aquí', async () => {
    yaExiste({ twoFactorEnabled: true, twoFactorSecret: 'SECRETO' });
    const res = await pedirVuelta({});
    expect(res.headers.get('location')).toBe(`${BASE}/sign-in?error=google_2fa`);
  });

  it('una cookie con otro correo no pisa el que verificó Google al firmar el alta', async () => {
    respuestas = [[], []]; // ni por id ni por correo: cuenta nueva
    const res = await pedirVuelta({ email: 'ajeno@ejemplo.invalid', googleId: 'ajeno', inviteId: '7' });

    expect(res.headers.get('location')).toContain('/completar-registro');
    expect(firmados[0]).toMatchObject({ email: 'real@ejemplo.invalid', googleId: 'g-1', inviteId: '7' });
  });
});
