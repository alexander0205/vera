// tests/unit/api-key-guard.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

interface FilaKey {
  id: number; teamId: number; keyHash: string; permisos: string;
  revokedAt: Date | null; expiresAt: Date | null;
}

/** Lo que devuelve la consulta por prefijo. Cada prueba lo arma como necesita. */
let filas: FilaKey[] = [];

let updateSetLlamado: unknown = null;
/** Cuántos bcrypt se gastaron. La prueba del señuelo mira esto. */
let comparaciones = 0;

function fila(over: Partial<FilaKey> = {}): FilaKey {
  return {
    id: 1, teamId: 42, keyHash: 'hash:emdo_valida', permisos: 'read',
    revokedAt: null, expiresAt: null, ...over,
  };
}

vi.mock('@/lib/db/drizzle', () => ({
  db: {
    // Sin `.limit()`: el guard compara TODAS las filas del prefijo.
    select: () => ({ from: () => ({ where: () => Promise.resolve(filas) }) }),
    update: () => ({
      set: (v: unknown) => { updateSetLlamado = v; return { where: () => Promise.resolve() }; },
    }),
  },
}));

// El hash de una fila es 'hash:' + la key que le corresponde, así el mock
// distingue qué key casa con qué fila (hace falta para la prueba de colisión).
vi.mock('bcryptjs', () => ({
  default: {
    compare: (raw: string, hash: string) => {
      comparaciones++;
      return Promise.resolve(hash === `hash:${raw}`);
    },
  },
}));

const { requireApiKey } = await import('@/lib/auth/api-key-guard');

function reqCon(auth?: string) {
  return new NextRequest('http://localhost/api/mcp/v1/clientes', {
    headers: auth ? { Authorization: auth } : {},
  });
}

beforeEach(() => {
  filas = [fila()];
  updateSetLlamado = null;
  comparaciones = 0;
});

describe('requireApiKey', () => {
  it('sin header Authorization → 401', async () => {
    const r = await requireApiKey(reqCon());
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.response.status).toBe(401);
  });

  it('header sin prefijo Bearer → 401', async () => {
    const r = await requireApiKey(reqCon('emdo_valida'));
    expect(r.ok).toBe(false);
  });

  it('key que no empieza por emdo_ → 401 sin consultar', async () => {
    const r = await requireApiKey(reqCon('Bearer otracosa_123'));
    expect(r.ok).toBe(false);
  });

  it('key correcta y con permiso de lectura → ok con teamId', async () => {
    const r = await requireApiKey(reqCon('Bearer emdo_valida'));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.teamId).toBe(42);
    expect(updateSetLlamado).toBeTruthy();
  });

  it('key con hash que no coincide → 401', async () => {
    const r = await requireApiKey(reqCon('Bearer emdo_otra'));
    expect(r.ok).toBe(false);
  });

  it('key revocada → 401 con el mismo mensaje que una key inválida', async () => {
    filas = [fila({ revokedAt: new Date() })];
    const r1 = await requireApiKey(reqCon('Bearer emdo_valida'));
    filas = [];
    const r2 = await requireApiKey(reqCon('Bearer emdo_noexiste'));
    expect(r1.ok).toBe(false);
    expect(r2.ok).toBe(false);
    if (!r1.ok && !r2.ok) {
      const b1 = await r1.response.clone().json();
      const b2 = await r2.response.clone().json();
      expect(b1.error).toBe(b2.error);
    }
  });

  it('key expirada → 401', async () => {
    filas = [fila({ expiresAt: new Date('2020-01-01') })];
    const r = await requireApiKey(reqCon('Bearer emdo_valida'));
    expect(r.ok).toBe(false);
  });

  it('permisos sin capacidad de lectura → 401', async () => {
    filas = [fila({ permisos: 'ninguno' })];
    const r = await requireApiKey(reqCon('Bearer emdo_valida'));
    expect(r.ok).toBe(false);
  });

  it('write y admin también pueden leer', async () => {
    for (const permisos of ['write', 'admin']) {
      filas = [fila({ permisos })];
      const r = await requireApiKey(reqCon('Bearer emdo_valida'));
      expect(r.ok).toBe(true);
    }
  });

  /**
   * El fallo que esto cierra: dos keys comparten prefijo (7 hex, sin UNIQUE en
   * la tabla) y la consulta traía UNA fila cualquiera. Si venía la ajena, la
   * key buena quedaba rechazada para siempre.
   */
  it('dos keys con el mismo prefijo: la buena entra aunque la otra vaya primero', async () => {
    filas = [
      fila({ id: 7, teamId: 99, keyHash: 'hash:emdo_ajena' }),
      fila({ id: 8, teamId: 42, keyHash: 'hash:emdo_valida' }),
    ];
    const r = await requireApiKey(reqCon('Bearer emdo_valida'));
    expect(r.ok).toBe(true);
    // Y entra con SU equipo, no con el de la fila que vino primero.
    if (r.ok) {
      expect(r.teamId).toBe(42);
      expect(r.apiKeyId).toBe(8);
    }
  });

  /**
   * Sin el señuelo, un prefijo inexistente contestaba sin pagar el bcrypt y esa
   * diferencia de tiempo (~140 ms medidos) confirmaba qué prefijos existen.
   */
  it('prefijo inexistente gasta un bcrypt igual, para no delatarse por tiempo', async () => {
    filas = [];
    const r = await requireApiKey(reqCon('Bearer emdo_noexiste'));
    expect(r.ok).toBe(false);
    expect(comparaciones).toBe(1);
  });

  it('prefijo existente con key mala gasta los mismos bcrypt que uno inexistente', async () => {
    const r = await requireApiKey(reqCon('Bearer emdo_mala'));
    expect(r.ok).toBe(false);
    expect(comparaciones).toBe(1);
  });
});
