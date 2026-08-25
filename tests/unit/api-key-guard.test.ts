// tests/unit/api-key-guard.test.ts
import { describe, it, expect, vi } from 'vitest';
import { NextRequest } from 'next/server';

const filaKey: {
  id: number; teamId: number; keyHash: string; permisos: string;
  revokedAt: Date | null; expiresAt: Date | null;
} = {
  id: 1, teamId: 42, keyHash: '', permisos: 'read', revokedAt: null, expiresAt: null,
};

let updateSetLlamado: unknown = null;

vi.mock('@/lib/db/drizzle', () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: () => Promise.resolve([filaKey]),
        }),
      }),
    }),
    update: () => ({
      set: (v: unknown) => { updateSetLlamado = v; return { where: () => Promise.resolve() }; },
    }),
  },
}));

vi.mock('bcryptjs', () => ({
  default: {
    compare: (raw: string) => Promise.resolve(raw === 'emdo_valida'),
  },
}));

const { requireApiKey } = await import('@/lib/auth/api-key-guard');

function reqCon(auth?: string) {
  return new NextRequest('http://localhost/api/mcp/v1/clientes', {
    headers: auth ? { Authorization: auth } : {},
  });
}

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
    filaKey.revokedAt = new Date();
    const r1 = await requireApiKey(reqCon('Bearer emdo_valida'));
    filaKey.revokedAt = null;
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
    filaKey.expiresAt = new Date('2020-01-01');
    const r = await requireApiKey(reqCon('Bearer emdo_valida'));
    filaKey.expiresAt = null;
    expect(r.ok).toBe(false);
  });

  it('permisos sin capacidad de lectura → 401', async () => {
    filaKey.permisos = 'ninguno';
    const r = await requireApiKey(reqCon('Bearer emdo_valida'));
    filaKey.permisos = 'read';
    expect(r.ok).toBe(false);
  });
});
