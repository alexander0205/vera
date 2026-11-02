// La acción de entrar con una cuenta que tiene 2FA. La pantalla se probó aparte;
// aquí se fija lo que responde el servidor, y que nunca devuelve la contraseña.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as OTPAuth from 'otpauth';

const SECRETO = new OTPAuth.Secret().base32;
const CONTRASENA = 'una-contrasena-de-prueba';

let usuario: Record<string, unknown> | null = null;
let hayCupo = true;
const sesiones: unknown[] = [];

vi.mock('@/lib/db/drizzle', () => {
  const cadena = {
    from: () => cadena,
    leftJoin: () => cadena,
    where: () => cadena,
    limit: () => Promise.resolve(usuario ? [{ user: usuario, team: { id: 9 } }] : []),
  };
  return { db: { select: () => cadena } };
});

vi.mock('next/headers', () => ({
  headers: () => Promise.resolve(new Headers({ 'x-forwarded-for': '203.0.113.1' })),
  cookies: () => Promise.resolve({}),
}));
vi.mock('next/navigation', () => ({
  redirect: (destino: string) => { throw new Error(`REDIRECT:${destino}`); },
}));
vi.mock('@/lib/rate-limit', () => ({ rateLimit: () => ({ allowed: hayCupo }) }));
vi.mock('@/lib/auth/session', () => ({
  comparePasswords: (a: string) => Promise.resolve(a === CONTRASENA),
  hashPassword: () => Promise.resolve('hash'),
  setSession: (u: unknown) => { sesiones.push(u); return Promise.resolve(); },
  clearSession: () => Promise.resolve(),
}));
vi.mock('@/lib/auth/permissions', () => ({ seedSystemRoles: () => Promise.resolve() }));
vi.mock('@/lib/payments/stripe', () => ({ createCheckoutSession: () => Promise.resolve({}) }));
vi.mock('@/lib/db/queries', () => ({ getUser: () => null, getUserWithTeam: () => null, getTeamForUser: () => null }));
vi.mock('@/lib/auth/alta', () => ({ darDeAlta: () => Promise.resolve({ ok: false, error: 'No se pudo' }) }));
vi.mock('@/lib/db/actividad', () => ({ logActivity: () => Promise.resolve() }));
vi.mock('@/lib/auth/verificacion', () => ({ mandarVerificacion: () => Promise.resolve() }));

const { signIn, signUp } = await import('@/app/(login)/actions');

function formulario(campos: Record<string, string>) {
  const datos = new FormData();
  for (const [campo, valor] of Object.entries(campos)) datos.set(campo, valor);
  return datos;
}

const entrar = (extra: Record<string, string> = {}, password = CONTRASENA) =>
  signIn({ error: '' }, formulario({ email: 'persona@ejemplo.invalid', password, ...extra }));

const codigoDeAhora = () => new OTPAuth.TOTP({ secret: OTPAuth.Secret.fromBase32(SECRETO) }).generate();

beforeEach(() => {
  hayCupo = true;
  sesiones.length = 0;
  usuario = {
    id: 1,
    email: 'persona@ejemplo.invalid',
    passwordHash: 'hash',
    platformRole: 'member',
    twoFactorEnabled: true,
    twoFactorSecret: SECRETO,
  };
});

describe('entrar con 2FA', () => {
  it('sin código pide el segundo paso, sin sesión y sin devolver la contraseña', async () => {
    expect(await entrar()).toEqual({ twoFactorRequired: true });
    expect(sesiones).toHaveLength(0);
  });

  it('con un código equivocado sigue en el segundo paso, sin sesión', async () => {
    const codigo = codigoDeAhora() === '000000' ? '111111' : '000000';
    const respuesta = await entrar({ twoFactorCode: codigo });
    expect(respuesta).toMatchObject({ twoFactorRequired: true, error: expect.any(String) });
    expect(respuesta).not.toHaveProperty('password');
    expect(sesiones).toHaveLength(0);
  });

  it('con el código de ahora entra', async () => {
    await expect(entrar({ twoFactorCode: codigoDeAhora() })).rejects.toThrow('REDIRECT:/dashboard');
    expect(sesiones).toHaveLength(1);
  });

  it('un código mal formado se explica en español', async () => {
    expect(await entrar({ twoFactorCode: '123' })).toEqual({ error: 'El código tiene 6 dígitos.' });
    expect(sesiones).toHaveLength(0);
  });

  it('un código bueno con la contraseña mala no entra', async () => {
    const respuesta = await entrar({ twoFactorCode: codigoDeAhora() }, 'otra-contrasena-mala');
    expect(respuesta).toEqual({ error: 'Correo o contraseña incorrectos. Intenta de nuevo.' });
    expect(sesiones).toHaveLength(0);
  });

  it('sin 2FA encendido no se pide nada', async () => {
    usuario = { ...usuario, twoFactorEnabled: false, twoFactorSecret: null };
    await expect(entrar()).rejects.toThrow('REDIRECT:/dashboard');
  });

  it('un secreto a medio configurar no encierra a nadie', async () => {
    usuario = { ...usuario, twoFactorEnabled: false };
    await expect(entrar()).rejects.toThrow('REDIRECT:/dashboard');
  });
});

describe('ninguna respuesta devuelve la contraseña', () => {
  it('ni con la contraseña mala', async () => {
    expect(await entrar({}, 'otra-contrasena-mala')).not.toHaveProperty('password');
  });

  it('ni con un correo que no existe', async () => {
    usuario = null;
    expect(await entrar()).not.toHaveProperty('password');
  });

  it('ni al fallar el registro, que solo devuelve el nombre', async () => {
    const respuesta = await signUp({ error: '' }, formulario({
      name: 'Persona', email: 'persona@ejemplo.invalid', password: CONTRASENA, terms: 'on',
    }));
    expect(respuesta).toEqual({ error: 'No se pudo', name: 'Persona' });
  });

  it('ni con demasiados intentos', async () => {
    hayCupo = false;
    expect(await entrar()).toEqual({ error: 'Demasiados intentos. Intenta en 1 minuto.' });
  });
});
