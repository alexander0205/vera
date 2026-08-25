// tests/unit/mcp-v1-clientes.test.ts
import { describe, it, expect, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/auth/api-key-guard', () => ({
  requireApiKey: vi.fn(),
}));

const clientesFixture = [
  { id: 1, teamId: 42, razonSocial: 'Colegio ABC', rnc: '101', email: 'a@x.com' },
];

vi.mock('@/lib/db/drizzle', () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({
          orderBy: () => ({
            limit: () => ({ offset: () => Promise.resolve(clientesFixture) }),
          }),
          limit: () => Promise.resolve(clientesFixture),
        }),
      }),
    }),
  },
}));

const { requireApiKey } = await import('@/lib/auth/api-key-guard');
const { GET: listar } = await import('@/app/api/mcp/v1/clientes/route');
const { GET: detalle } = await import('@/app/api/mcp/v1/clientes/[id]/route');

describe('GET /api/mcp/v1/clientes', () => {
  it('sin key válida → 401, no llega a la DB', async () => {
    vi.mocked(requireApiKey).mockResolvedValue({
      ok: false,
      response: new Response(JSON.stringify({ error: 'x' }), { status: 401 }) as never,
    });
    const res = await listar(new NextRequest('http://localhost/api/mcp/v1/clientes'));
    expect(res.status).toBe(401);
  });

  it('con key válida → 200 y lista de clientes', async () => {
    vi.mocked(requireApiKey).mockResolvedValue({ ok: true, teamId: 42, apiKeyId: 1 });
    const res = await listar(new NextRequest('http://localhost/api/mcp/v1/clientes'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.clientes).toEqual(clientesFixture);
  });
});

describe('GET /api/mcp/v1/clientes/[id]', () => {
  it('con key válida → 200 y el cliente', async () => {
    vi.mocked(requireApiKey).mockResolvedValue({ ok: true, teamId: 42, apiKeyId: 1 });
    const res = await detalle(
      new NextRequest('http://localhost/api/mcp/v1/clientes/1'),
      { params: Promise.resolve({ id: '1' }) },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.cliente).toEqual(clientesFixture[0]);
  });

  it('id no numérico → 400', async () => {
    vi.mocked(requireApiKey).mockResolvedValue({ ok: true, teamId: 42, apiKeyId: 1 });
    const res = await detalle(
      new NextRequest('http://localhost/api/mcp/v1/clientes/abc'),
      { params: Promise.resolve({ id: 'abc' }) },
    );
    expect(res.status).toBe(400);
  });
});
