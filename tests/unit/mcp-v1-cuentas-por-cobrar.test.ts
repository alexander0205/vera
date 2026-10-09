import { describe, it, expect, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/auth/api-key-guard', () => ({ requireApiKey: vi.fn() }));

const resultadoFixture = {
  cuentas: [{ id: 9, encf: 'E310000000009', saldo: 590000, vencida: false }],
  pendiente: 590000, vencido: 0, count: 1, countVencidas: 0,
  antiguedad: { porVencer: 590000, d1a30: 0, d31a60: 0, d61a90: 0, d90mas: 0 },
};

vi.mock('@/lib/db/queries', () => ({
  getCuentasPorCobrar: vi.fn(() => Promise.resolve(resultadoFixture)),
}));

const { requireApiKey } = await import('@/lib/auth/api-key-guard');
const { getCuentasPorCobrar } = await import('@/lib/db/queries');
const { GET } = await import('@/app/api/mcp/v1/cuentas-por-cobrar/route');

describe('GET /api/mcp/v1/cuentas-por-cobrar', () => {
  it('sin key válida → 401, no llama a getCuentasPorCobrar', async () => {
    vi.mocked(requireApiKey).mockResolvedValue({
      ok: false, response: new Response(null, { status: 401 }) as never,
    });
    const res = await GET(new NextRequest('http://localhost/api/mcp/v1/cuentas-por-cobrar'));
    expect(res.status).toBe(401);
    expect(getCuentasPorCobrar).not.toHaveBeenCalled();
  });

  it('con key válida → 200 con el resultado de getCuentasPorCobrar escopado al teamId de la key', async () => {
    vi.mocked(requireApiKey).mockResolvedValue({ ok: true, teamId: 42, apiKeyId: 1 });
    const res = await GET(new NextRequest('http://localhost/api/mcp/v1/cuentas-por-cobrar?soloVencidas=true'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual(resultadoFixture);
    expect(getCuentasPorCobrar).toHaveBeenCalledWith(42, expect.objectContaining({ soloVencidas: true }));
  });
});
