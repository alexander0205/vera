import { describe, it, expect, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/auth/api-key-guard', () => ({ requireApiKey: vi.fn() }));

const recurrenteFixture = {
  id: 3, teamId: 42, clientId: 1, nombre: 'Mensualidad Primaria',
  descripcion: null, tipoEcf: '31', tipoPago: 2, diasParaPago: 5,
  frecuencia: 'mensual', diaCobro: 1, fechaInicio: '2026-01-01', fechaFin: null,
  proximaEmision: '2026-09-01', estado: 'activa', items: '[]', notas: null,
  totalEstimado: 500000, facturasEmitidas: 8,
  createdAt: new Date(), updatedAt: new Date(),
};

vi.mock('@/lib/db/drizzle', () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({
          orderBy: () => ({ limit: () => ({ offset: () => Promise.resolve([recurrenteFixture]) }) }),
          limit: () => Promise.resolve([recurrenteFixture]),
        }),
      }),
    }),
  },
}));

const { requireApiKey } = await import('@/lib/auth/api-key-guard');
const { GET: listar } = await import('@/app/api/mcp/v1/facturas-recurrentes/route');
const { GET: detalle } = await import('@/app/api/mcp/v1/facturas-recurrentes/[id]/route');

describe('GET /api/mcp/v1/facturas-recurrentes', () => {
  it('sin key válida → 401', async () => {
    vi.mocked(requireApiKey).mockResolvedValue({
      ok: false, response: new Response(null, { status: 401 }) as never,
    });
    const res = await listar(new NextRequest('http://localhost/api/mcp/v1/facturas-recurrentes'));
    expect(res.status).toBe(401);
  });

  it('con key válida → 200 y lista', async () => {
    vi.mocked(requireApiKey).mockResolvedValue({ ok: true, teamId: 42, apiKeyId: 1 });
    const res = await listar(new NextRequest('http://localhost/api/mcp/v1/facturas-recurrentes'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.facturasRecurrentes).toHaveLength(1);
  });
});

describe('GET /api/mcp/v1/facturas-recurrentes/[id]', () => {
  it('con key válida → 200 y el plan', async () => {
    vi.mocked(requireApiKey).mockResolvedValue({ ok: true, teamId: 42, apiKeyId: 1 });
    const res = await detalle(
      new NextRequest('http://localhost/api/mcp/v1/facturas-recurrentes/3'),
      { params: Promise.resolve({ id: '3' }) },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.facturaRecurrente.nombre).toBe('Mensualidad Primaria');
  });

  it('id no numérico → 400', async () => {
    vi.mocked(requireApiKey).mockResolvedValue({ ok: true, teamId: 42, apiKeyId: 1 });
    const res = await detalle(
      new NextRequest('http://localhost/api/mcp/v1/facturas-recurrentes/abc'),
      { params: Promise.resolve({ id: 'abc' }) },
    );
    expect(res.status).toBe(400);
  });
});
