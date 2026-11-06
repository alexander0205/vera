/** Confirmar un activo con valor residual «0.00» (como lo manda el diálogo) no es un error. */
import { describe, it, expect, vi } from 'vitest';

const editar = vi.fn(async (..._a: unknown[]) => ({ avisos: [] as string[] }));
vi.mock('@/lib/auth/api-guard', () => ({ requirePermission: vi.fn(async () => ({ ok: true, teamId: 35, user: { id: 1 } })) }));
vi.mock('@/lib/contabilidad/activos-fijos-db', () => ({ editarActivoFijo: (...a: unknown[]) => (editar as unknown as (...x: unknown[]) => Promise<unknown>)(...a) }));
vi.mock('@/lib/contabilidad/depreciacion', () => ({ ActivoFijoError: class extends Error {} }));
vi.mock('@/lib/cache/escolar', () => ({ invalidarPlanta: () => {} }));

import { PATCH } from '@/app/api/contabilidad/activos-fijos/[id]/route';

const llamar = (body: object) => PATCH(new Request('http://x', { method: 'PATCH', body: JSON.stringify(body) }) as never, { params: Promise.resolve({ id: '9' }) });

describe('PATCH activo: valor residual', () => {
  it.each(['0.00', '0', 0, ''])('%s se acepta como cero', async (v) => {
    const r = await llamar({ valorResidualPesos: v, confirmar: true });
    expect(r.status).toBe(200);
  });
  it('un valor mayor que cero se convierte a centavos', async () => {
    await llamar({ valorResidualPesos: '1500.50' });
    expect(editar.mock.calls.at(-1)![3]).toMatchObject({ valorResidualCents: 150050 });
  });
});
