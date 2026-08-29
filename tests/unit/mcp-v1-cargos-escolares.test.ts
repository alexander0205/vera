// tests/unit/mcp-v1-cargos-escolares.test.ts
import { describe, it, expect, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/auth/api-key-guard', () => ({ requireApiKey: vi.fn() }));

const cargoFixture = {
  id: 12, estudianteId: 412, conceptoId: 3, mes: 10, anio: 2026,
  montoCentavos: 850000, saldoCentavos: 850000,
  fechaVencimiento: '2026-10-05', estado: 'pendiente',
  ecfDocumentId: null, createdAt: new Date(),
  estudianteNombre: 'Juan Pérez', concepto: 'Colegiatura',
};
const totalesFixture = { total: 850000, saldo: 850000, count: 1 };

// Igual que en pagos: `where()` sirve a la página (sigue con orderBy) y a la
// consulta de totales (se espera directo), así que es un thenable con métodos.
vi.mock('@/lib/db/drizzle', () => {
  const where = () => ({
    then: (r: (v: unknown) => unknown) => Promise.resolve([totalesFixture]).then(r),
    orderBy: () => ({ limit: () => ({ offset: () => Promise.resolve([cargoFixture]) }) }),
    limit: () => Promise.resolve([cargoFixture]),
  });
  const conJoins = () => ({ innerJoin: () => ({ innerJoin: () => ({ where }) }), where });
  return { db: { select: () => ({ from: conJoins }) } };
});

const { requireApiKey } = await import('@/lib/auth/api-key-guard');
const { GET: listar } = await import('@/app/api/mcp/v1/cargos-escolares/route');
const { GET: detalle } = await import('@/app/api/mcp/v1/cargos-escolares/[id]/route');

const KEY_OK = { ok: true as const, teamId: 42, apiKeyId: 1 };
const KEY_MAL = { ok: false as const, response: new Response(null, { status: 401 }) as never };
const url = (qs = '') => new NextRequest(`http://localhost/api/mcp/v1/cargos-escolares${qs}`);

describe('GET /api/mcp/v1/cargos-escolares', () => {
  it('sin key válida → 401', async () => {
    vi.mocked(requireApiKey).mockResolvedValue(KEY_MAL);
    expect((await listar(url())).status).toBe(401);
  });

  it('con key válida → 200, con nombre del alumno y concepto, no solo ids', async () => {
    vi.mocked(requireApiKey).mockResolvedValue(KEY_OK);
    const res = await listar(url('?desde=2026-10-01&hasta=2026-10-31'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.cargos).toHaveLength(1);
    expect(body.cargos[0].estudianteNombre).toBe('Juan Pérez');
    expect(body.cargos[0].concepto).toBe('Colegiatura');
  });

  /**
   * `saldo` es el que responde «¿cuánto voy a cobrar?»: `total` es lo que se
   * cargó, `saldo` lo que falta. Si se pierde uno de los dos, la respuesta
   * cambia de significado sin que se note.
   */
  it('devuelve total, saldo y count de TODO el filtro', async () => {
    vi.mocked(requireApiKey).mockResolvedValue(KEY_OK);
    const body = await (await listar(url('?limit=1'))).json();
    expect(body).toMatchObject({ total: 850000, saldo: 850000, count: 1 });
  });

  it.each([
    ['?estudianteId=abc', 'estudianteId inválido'],
    ['?mes=13', 'mes inválido (1-12)'],
    ['?mes=0', 'mes inválido (1-12)'],
    ['?anio=abc', 'anio inválido'],
    ['?desde=abc', 'desde inválido (usa YYYY-MM-DD)'],
    ['?hasta=abc', 'hasta inválido (usa YYYY-MM-DD)'],
  ])('filtro basura %s → 400', async (qs, mensaje) => {
    vi.mocked(requireApiKey).mockResolvedValue(KEY_OK);
    const res = await listar(url(qs));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe(mensaje);
  });
});

describe('GET /api/mcp/v1/cargos-escolares/[id]', () => {
  it('con key válida → 200 y el cargo', async () => {
    vi.mocked(requireApiKey).mockResolvedValue(KEY_OK);
    const res = await detalle(url('/12'), { params: Promise.resolve({ id: '12' }) });
    expect(res.status).toBe(200);
    expect((await res.json()).cargo.id).toBe(12);
  });

  it.each(['abc', '1e21', '0', '-3'])('id inválido %s → 400', async (id) => {
    vi.mocked(requireApiKey).mockResolvedValue(KEY_OK);
    const res = await detalle(url(`/${id}`), { params: Promise.resolve({ id }) });
    expect(res.status).toBe(400);
  });
});
