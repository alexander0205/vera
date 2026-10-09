// tests/unit/mcp-v1-pagos.test.ts
import { describe, it, expect, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/auth/api-key-guard', () => ({ requireApiKey: vi.fn() }));

const pagoFixture = {
  id: 7, ecfDocumentId: 9, montoCentavos: 250000, metodo: 'efectivo',
  notaCreditoId: null, referencia: null, cuenta: 'Caja principal',
  fechaPago: '2026-08-28', notas: null, createdAt: new Date(),
  registradoPor: 'Ana Pérez', facturaCodigo: 'F-2026-1', facturaEncf: 'E310000000009',
};
const totalesFixture = { total: 250000, count: 1 };

// El `where()` tiene que servir a las dos consultas de la ruta: la página
// (sigue con orderBy/limit/offset) y la de totales (se espera directo). Por eso
// es un thenable que además lleva los métodos de la cadena larga.
vi.mock('@/lib/db/drizzle', () => {
  const where = () => ({
    then: (r: (v: unknown) => unknown) => Promise.resolve([totalesFixture]).then(r),
    orderBy: () => ({ limit: () => ({ offset: () => Promise.resolve([pagoFixture]) }) }),
    limit: () => Promise.resolve([pagoFixture]),
  });
  const conJoins = () => ({ innerJoin: () => ({ leftJoin: () => ({ where }) }), where });
  return { db: { select: () => ({ from: conJoins }) } };
});

const { requireApiKey } = await import('@/lib/auth/api-key-guard');
const { GET: listar } = await import('@/app/api/mcp/v1/pagos/route');
const { GET: detalle } = await import('@/app/api/mcp/v1/pagos/[id]/route');

const KEY_OK = { ok: true as const, teamId: 42, apiKeyId: 1 };
const KEY_MAL = { ok: false as const, response: new Response(null, { status: 401 }) as never };

describe('GET /api/mcp/v1/pagos', () => {
  it('sin key válida → 401', async () => {
    vi.mocked(requireApiKey).mockResolvedValue(KEY_MAL);
    const res = await listar(new NextRequest('http://localhost/api/mcp/v1/pagos'));
    expect(res.status).toBe(401);
  });

  it('con key válida → 200 con los pagos', async () => {
    vi.mocked(requireApiKey).mockResolvedValue(KEY_OK);
    const res = await listar(new NextRequest('http://localhost/api/mcp/v1/pagos?metodo=efectivo'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.pagos).toHaveLength(1);
    expect(body.pagos[0].metodo).toBe('efectivo');
    expect(body.pagos[0].registradoPor).toBe('Ana Pérez');
  });

  it('devuelve total y count de TODO el filtro, no solo de la página', async () => {
    vi.mocked(requireApiKey).mockResolvedValue(KEY_OK);
    const res = await listar(new NextRequest('http://localhost/api/mcp/v1/pagos?limit=1'));
    const body = await res.json();
    expect(body.total).toBe(250000);
    expect(body.count).toBe(1);
  });

  // Los tres validadores existen porque sin ellos la consulta reventaba en
  // Postgres con un 500 sin control.
  it.each([
    ['clientId=abc', 'clientId inválido'],
    ['ecfDocumentId=abc', 'ecfDocumentId inválido'],
    ['desde=abc', 'desde inválido (usa YYYY-MM-DD)'],
    ['hasta=abc', 'hasta inválido (usa YYYY-MM-DD)'],
  ])('filtro basura %s → 400', async (qs, mensaje) => {
    vi.mocked(requireApiKey).mockResolvedValue(KEY_OK);
    const res = await listar(new NextRequest(`http://localhost/api/mcp/v1/pagos?${qs}`));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe(mensaje);
  });
});

describe('GET /api/mcp/v1/pagos/[id]', () => {
  it('con key válida → 200 y el pago', async () => {
    vi.mocked(requireApiKey).mockResolvedValue(KEY_OK);
    const res = await detalle(
      new NextRequest('http://localhost/api/mcp/v1/pagos/7'),
      { params: Promise.resolve({ id: '7' }) },
    );
    expect(res.status).toBe(200);
    expect((await res.json()).pago.id).toBe(7);
  });

  // `parseInt('1e+21')` es 1: sin idValido, pedir 1e21 devolvía el pago nº 1.
  it.each(['abc', '1e21', '0', '-3', '99999999999'])('id inválido %s → 400', async (id) => {
    vi.mocked(requireApiKey).mockResolvedValue(KEY_OK);
    const res = await detalle(
      new NextRequest(`http://localhost/api/mcp/v1/pagos/${id}`),
      { params: Promise.resolve({ id }) },
    );
    expect(res.status).toBe(400);
  });
});
