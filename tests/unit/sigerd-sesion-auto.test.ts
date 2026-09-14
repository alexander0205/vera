// tests/unit/sigerd-sesion-auto.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SigerdError } from '@/lib/sigerd/types';

/**
 * Cómo entra Zero a SIGERD: la cookie del navegador si sigue viva, y si no las
 * credenciales guardadas del colegio.
 *
 * Es el arreglo de «Conectar ✓ pero no hay sesión»: la obtención completa solo
 * miraba la cookie, y un colegio con credenciales guardadas recibía «No hay
 * sesión de SIGERD». Lo que se prueba aquí es el orden y, sobre todo, cuándo NO
 * hay que caer a las credenciales: un portal caído no se arregla entrando otra
 * vez, y reintentar repetiría el fallo.
 */

const estado = vi.hoisted(() => ({
  cookie: null as null | { perfil: unknown },
  cookieViva: true,
  credenciales: null as null | { usuario: string; clave: string },
  login: { estado: 'autenticado' } as { estado: string; perfiles?: unknown[] },
  loginError: null as Error | null,
  perfilElegido: null as unknown,
  cookieBorrada: 0,
  sesionGuardada: 0,
  verificadas: [] as unknown[],
  fallos: [] as string[],
}));

vi.mock('@/lib/sigerd/client', () => {
  class SigerdClient {
    origen: string;
    perfil: unknown = null;
    constructor(origen = 'login') { this.origen = origen; }
    static desdeSesion(s: { perfil?: unknown }) {
      const c = new SigerdClient('cookie');
      c.perfil = s.perfil ?? null;
      return c;
    }
    async estaAutenticado() { return estado.cookieViva; }
    async iniciarSesion() {
      if (estado.loginError) throw estado.loginError;
      return estado.login;
    }
    async seleccionarPerfil(p: unknown) { this.perfil = p; estado.perfilElegido = p; }
    exportarSesion() { return { cookies: {}, token: null, perfil: this.perfil, actualizadaEn: 1 }; }
  }
  return { SigerdClient };
});

vi.mock('@/lib/sigerd/sesion-cookie', () => ({
  leerSesion: async () => estado.cookie,
  guardarSesion: async () => { estado.sesionGuardada++; },
  borrarSesion: async () => { estado.cookieBorrada++; },
}));

vi.mock('@/lib/sigerd/credenciales', () => ({
  conCredenciales: async (_teamId: number, fn: (u: string, c: string, x: unknown) => Promise<unknown>) =>
    estado.credenciales ? fn(estado.credenciales.usuario, estado.credenciales.clave, null) : null,
  marcarVerificadas: async (_t: number, centro?: unknown) => { estado.verificadas.push(centro ?? null); },
  marcarFallo: async (_t: number, motivo: string) => { estado.fallos.push(motivo); },
}));

vi.mock('@/lib/sigerd/personal', () => ({
  contextoCentroSesion: async () => ({ idRegional: 10, idDistrito: 3, idCentro: 4521, usuario: null, nivel: null }),
}));

beforeEach(() => {
  estado.cookie = null;
  estado.cookieViva = true;
  estado.credenciales = null;
  estado.login = { estado: 'autenticado' };
  estado.loginError = null;
  estado.perfilElegido = null;
  estado.cookieBorrada = 0;
  estado.sesionGuardada = 0;
  estado.verificadas = [];
  estado.fallos = [];
});

/**
 * La operación de prueba: dice con qué cliente la llamaron. El parámetro va
 * como `unknown` porque el cliente es el simulado de arriba, no `SigerdClient`.
 */
const origenDe = (cli: unknown) => (cli as { origen: string }).origen;
const quien = async (cli: unknown) => origenDe(cli);

describe('conClienteSigerd', () => {
  it('con la cookie viva no toca las credenciales', async () => {
    const { conClienteSigerd } = await import('@/lib/sigerd/sesion-auto');
    estado.cookie = { perfil: null };
    estado.credenciales = { usuario: '001', clave: 'x' };

    const r = await conClienteSigerd(2, quien);

    expect(r).toMatchObject({ datos: 'cookie', origen: 'cookie' });
    expect(estado.sesionGuardada).toBe(1);
  });

  it('cookie caducada a mitad → la borra y entra con lo guardado', async () => {
    const { conClienteSigerd } = await import('@/lib/sigerd/sesion-auto');
    estado.cookie = { perfil: null };
    estado.credenciales = { usuario: '001', clave: 'x' };
    let intentos = 0;

    const r = await conClienteSigerd(2, async (cli: unknown) => {
      intentos++;
      if (origenDe(cli) === 'cookie') throw new SigerdError('sesion-expirada', 'caducó');
      return origenDe(cli);
    });

    expect(r).toMatchObject({ datos: 'login', origen: 'credenciales' });
    expect(intentos).toBe(2);
    expect(estado.cookieBorrada).toBe(1);
  });

  it('un portal caído NO cae a las credenciales: reintentar repetiría el fallo', async () => {
    const { conClienteSigerd } = await import('@/lib/sigerd/sesion-auto');
    estado.cookie = { perfil: null };
    estado.credenciales = { usuario: '001', clave: 'x' };

    await expect(conClienteSigerd(2, async () => {
      throw new SigerdError('red', 'timeout');
    })).rejects.toMatchObject({ codigo: 'red' });
    expect(estado.cookieBorrada).toBe(0);
  });

  it('sin cookie y sin credenciales devuelve null, no un error', async () => {
    const { conClienteSigerd } = await import('@/lib/sigerd/sesion-auto');
    expect(await conClienteSigerd(2, quien)).toBeNull();
  });

  it('verificarCookie: una cookie muerta pasa a credenciales SIN correr la operación con ella', async () => {
    // La obtención completa se traga los errores del portal; si se corriera con
    // la cookie muerta devolvería «SIGERD no disponible» en vez de reconectar.
    const { conClienteSigerd } = await import('@/lib/sigerd/sesion-auto');
    estado.cookie = { perfil: null };
    estado.cookieViva = false;
    estado.credenciales = { usuario: '001', clave: 'x' };
    const vistos: string[] = [];

    const r = await conClienteSigerd(2, async (cli: unknown) => {
      vistos.push(origenDe(cli));
      return origenDe(cli);
    }, { verificarCookie: true });

    expect(vistos).toEqual(['login']);
    expect(r?.origen).toBe('credenciales');
  });

  it('soloCredenciales ignora la cookie aunque esté viva', async () => {
    const { conClienteSigerd } = await import('@/lib/sigerd/sesion-auto');
    estado.cookie = { perfil: null };
    estado.credenciales = { usuario: '001', clave: 'x' };

    const r = await conClienteSigerd(2, quien, { soloCredenciales: true });
    expect(r).toMatchObject({ datos: 'login', origen: 'credenciales' });
  });

  it('con varios perfiles toma el primero y lo devuelve', async () => {
    const { conClienteSigerd } = await import('@/lib/sigerd/sesion-auto');
    estado.credenciales = { usuario: '001', clave: 'x' };
    const perfil = { idCentro: 4521, nombreCentro: 'Infantil Mi Casita II', id: '4521-1-10' };
    estado.login = { estado: 'seleccion-perfil', perfiles: [perfil, { idCentro: 9 }] };

    const r = await conClienteSigerd(2, quien);
    expect(estado.perfilElegido).toBe(perfil);
    expect(r?.perfil).toBe(perfil);
  });
});

describe('conSesionSigerdAuto', () => {
  it('una contraseña mala vuelve como 401 con su mensaje, no como excepción', async () => {
    // Antes el fallo al entrar con lo guardado se escapaba del handler: 500 sin
    // cuerpo en vez de «Usuario o contraseña no válidos».
    const { conSesionSigerdAuto } = await import('@/lib/sigerd/sesion-auto');
    estado.credenciales = { usuario: '001', clave: 'mala' };
    estado.loginError = new SigerdError('credenciales-invalidas', 'Usuario o contraseña no válidos.');

    const res = await conSesionSigerdAuto(2, quien);
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ codigo: 'credenciales-invalidas' });
  });
});

describe('probarCredencialesSigerd', () => {
  it('si el portal acepta, anota la verificación con el centro', async () => {
    const { probarCredencialesSigerd } = await import('@/lib/sigerd/sesion-auto');
    estado.credenciales = { usuario: '00100000001', clave: 'x' };

    const r = await probarCredencialesSigerd(22);
    expect(r).toEqual({ idCentro: 4521, nombreCentro: null });
    expect(estado.verificadas).toEqual([{ idCentro: 4521, nombre: null }]);
  });

  it('prueba LO GUARDADO aunque haya una cookie viva', async () => {
    const { probarCredencialesSigerd } = await import('@/lib/sigerd/sesion-auto');
    estado.cookie = { perfil: null };
    estado.credenciales = { usuario: '001', clave: 'mala' };
    estado.loginError = new SigerdError('credenciales-invalidas', 'Usuario o contraseña no válidos.');

    await expect(probarCredencialesSigerd(22)).rejects.toMatchObject({ codigo: 'credenciales-invalidas' });
    expect(estado.fallos).toEqual(['Usuario o contraseña no válidos.']);
    expect(estado.verificadas).toEqual([]);
  });

  it('sin credenciales no anota nada', async () => {
    const { probarCredencialesSigerd } = await import('@/lib/sigerd/sesion-auto');
    expect(await probarCredencialesSigerd(22)).toBeNull();
    expect(estado.verificadas).toEqual([]);
    expect(estado.fallos).toEqual([]);
  });
});
