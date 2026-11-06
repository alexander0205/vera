import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * La foto del equipo de Zero para los colegios: solo fotos de cuentas del
 * equipo, solo con sesión, sin exponer el correo.
 */

const m = vi.hoisted(() => ({
  user: null as { id: number } | null,
  fila: undefined as unknown,
  campos: [] as string[][],
  falla: false,
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/db/queries', () => ({ getUser: async () => m.user }));
vi.mock('@/lib/db/drizzle', () => ({
  db: {
    select: (campos: Record<string, unknown>) => {
      m.campos.push(Object.keys(campos));
      const cadena = {
        from: () => cadena,
        innerJoin: () => cadena,
        where: () => cadena,
        limit: async () => { if (m.falla) throw new Error('base caída'); return m.fila === undefined ? [] : [m.fila]; },
        then: (ok: (v: unknown) => unknown, ko?: (e: unknown) => unknown) =>
          (m.falla ? Promise.reject(new Error('base caída')) : Promise.resolve(m.fila === undefined ? [] : [m.fila])).then(ok, ko),
      };
      return cadena;
    },
  },
}));

import { GET } from '@/app/api/equipo-zero/[id]/foto/route';
import { leerFotoParaColegios } from '@/lib/auth/equipo-zero-perfil';
import { fotoServibleAColegios } from '@/lib/auth/equipo-zero-perfil-reglas';
import { personasDelEquipo } from '@/lib/administracion-escolar/tareas-atiende';

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);
const TEXTO = new Uint8Array([0x3c, 0x73, 0x76, 0x67, 0x3e, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);

const pedir = (id: string) => GET(new Request('http://localhost/x') as never, { params: Promise.resolve({ id }) });

beforeEach(() => {
  m.user = { id: 1 };
  m.fila = undefined;
  m.campos = [];
  m.falla = false;
});

describe('fotoServibleAColegios', () => {
  const base = { platformRole: 'admin', deletedAt: null, foto: JPEG };
  it('sirve la foto de una cuenta del equipo', () => {
    expect(fotoServibleAColegios(base)).toEqual({ foto: JPEG, tipo: 'image/jpeg' });
  });
  it('no sirve la de quien no es del equipo', () => {
    expect(fotoServibleAColegios({ ...base, platformRole: null })).toBeNull();
    expect(fotoServibleAColegios({ ...base, platformRole: 'user' })).toBeNull();
    expect(fotoServibleAColegios({ ...base, platformRole: 'owner' })).toBeNull();
  });
  it('no sirve la de una cuenta borrada, sin foto o que no es una imagen', () => {
    expect(fotoServibleAColegios({ ...base, deletedAt: new Date() })).toBeNull();
    expect(fotoServibleAColegios({ ...base, foto: null })).toBeNull();
    expect(fotoServibleAColegios({ ...base, foto: TEXTO })).toBeNull();
    expect(fotoServibleAColegios(undefined)).toBeNull();
  });
});

describe('leerFotoParaColegios', () => {
  it('una cuenta que no es del equipo no entrega foto, aunque la base la tenga', async () => {
    m.fila = { platformRole: null, deletedAt: null, foto: JPEG };
    expect(await leerFotoParaColegios(5)).toBeNull();
  });
  it('una cuenta del equipo sí; y no lee ningún correo', async () => {
    m.fila = { platformRole: 'admin', deletedAt: null, foto: JPEG };
    expect(await leerFotoParaColegios(5)).toEqual({ foto: JPEG, tipo: 'image/jpeg' });
    expect(m.campos.flat()).not.toContain('email');
  });
  it('si la tabla falta o la base falla, no entrega nada', async () => {
    m.falla = true;
    expect(await leerFotoParaColegios(5)).toBeNull();
  });
});

describe('GET /api/equipo-zero/:id/foto', () => {
  it('sin sesión: 401', async () => {
    m.user = null;
    expect((await pedir('5')).status).toBe(401);
  });
  it('un id que no es un número: 400', async () => {
    expect((await pedir('abc')).status).toBe(400);
    expect((await pedir('0')).status).toBe(400);
  });
  it('la foto de quien no es del equipo: 404, como si no existiera', async () => {
    m.fila = { platformRole: null, deletedAt: null, foto: JPEG };
    const r = await pedir('5');
    expect(r.status).toBe(404);
    expect(r.headers.get('Cache-Control')).toBe('no-store');
  });
  it('la foto de alguien del equipo: bytes, tipo real, caché privada', async () => {
    m.fila = { platformRole: 'admin', deletedAt: null, foto: JPEG };
    const r = await pedir('5');
    expect(r.status).toBe(200);
    expect(r.headers.get('Content-Type')).toBe('image/jpeg');
    expect(r.headers.get('Cache-Control')).toBe('private, max-age=86400');
    expect(r.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(new Uint8Array(await r.arrayBuffer())).toEqual(JPEG);
  });
  it('no sirve como imagen unos bytes que no lo son', async () => {
    m.fila = { platformRole: 'admin', deletedAt: null, foto: TEXTO };
    expect((await pedir('5')).status).toBe(404);
  });
});

describe('lo que se lee del equipo para los colegios', () => {
  it('de `users` solo el id y el nombre: nunca el correo', async () => {
    m.fila = { id: 5, name: 'Marta Lópe' };
    await personasDelEquipo([5]);
    const deUsers = m.campos.find((c) => c.includes('name'));
    expect(deUsers).toEqual(['id', 'name']);
    expect(m.campos.flat()).not.toContain('email');
  });
  it('si la base falla, no hay personas y no lanza', async () => {
    m.falla = true;
    m.fila = { id: 5, name: 'Marta' };
    await expect(personasDelEquipo([5])).resolves.toEqual(new Map());
  });
});
