// tests/unit/mcp-v1-facturas.test.ts
import { describe, it, expect, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/auth/api-key-guard', () => ({ requireApiKey: vi.fn() }));

const facturaFixture = {
  id: 9, teamId: 42, encf: 'E310000000009', codigo: 'F-2026-1', tipoEcf: '31',
  estado: 'ACEPTADO', estadoPago: 'PENDIENTE', clientId: 1,
  rncComprador: '101', razonSocialComprador: 'Colegio ABC', emailComprador: 'a@x.com',
  montoTotal: 500000, totalItbis: 90000, totalRetenciones: 0, tipoPago: 2,
  fechaEmision: new Date('2026-08-01'), fechaLimitePago: '2026-08-06',
  dependienteId: null, dependienteNombre: null, origenRecurrenteId: null,
  periodoRecurrente: null, createdAt: new Date(), updatedAt: new Date(),
};

vi.mock('@/lib/db/drizzle', () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({
          orderBy: () => ({ limit: () => ({ offset: () => Promise.resolve([facturaFixture]) }) }),
          limit: () => Promise.resolve([facturaFixture]),
        }),
      }),
    }),
  },
}));

const { requireApiKey } = await import('@/lib/auth/api-key-guard');
const { GET: listar } = await import('@/app/api/mcp/v1/facturas/route');
const { GET: detalle } = await import('@/app/api/mcp/v1/facturas/[id]/route');

describe('GET /api/mcp/v1/facturas', () => {
  it('sin key válida → 401', async () => {
    vi.mocked(requireApiKey).mockResolvedValue({
      ok: false, response: new Response(null, { status: 401 }) as never,
    });
    const res = await listar(new NextRequest('http://localhost/api/mcp/v1/facturas'));
    expect(res.status).toBe(401);
  });

  it('con key válida → 200 y lista de facturas', async () => {
    vi.mocked(requireApiKey).mockResolvedValue({ ok: true, teamId: 42, apiKeyId: 1 });
    const res = await listar(new NextRequest('http://localhost/api/mcp/v1/facturas?estado=PENDIENTE'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.facturas).toHaveLength(1);
    expect(body.facturas[0].encf).toBe('E310000000009');
  });
});

describe('GET /api/mcp/v1/facturas/[id]', () => {
  it('con key válida → 200 y la factura', async () => {
    vi.mocked(requireApiKey).mockResolvedValue({ ok: true, teamId: 42, apiKeyId: 1 });
    const res = await detalle(
      new NextRequest('http://localhost/api/mcp/v1/facturas/9'),
      { params: Promise.resolve({ id: '9' }) },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.factura.id).toBe(9);
  });

  it('id no numérico → 400', async () => {
    vi.mocked(requireApiKey).mockResolvedValue({ ok: true, teamId: 42, apiKeyId: 1 });
    const res = await detalle(
      new NextRequest('http://localhost/api/mcp/v1/facturas/abc'),
      { params: Promise.resolve({ id: 'abc' }) },
    );
    expect(res.status).toBe(400);
  });
});
