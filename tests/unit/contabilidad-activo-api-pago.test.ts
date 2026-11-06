/** La ruta de alta de activos valida las cuentas: solo caja/banco para «pagué de contado» y solo 12xx para «ya en libros». */
import { describe, it, expect, vi } from 'vitest';
import { esCuentaCajaBanco, esCuentaDeActivoFijo } from '@/lib/contabilidad/activos-fijos';

const registrar = vi.fn(async () => 5);
vi.mock('@/lib/auth/api-guard', () => ({
  requirePermission: vi.fn(async (_p: string, opts?: { escritura?: boolean }) => ({ ok: true, teamId: 35, user: { id: 1 }, escritura: opts?.escritura })),
}));
vi.mock('@/lib/contabilidad/depreciacion', () => ({
  registrarActivoFijo: (...a: unknown[]) => (registrar as unknown as (...x: unknown[]) => Promise<number>)(...a),
  ActivoFijoError: class extends Error {},
}));
vi.mock('@/lib/cache/escolar', () => ({ invalidarPlanta: () => {} }));
vi.mock('@/lib/contabilidad/config', () => {
  const lista = [
    { id: 1, codigo: '1101', nombre: 'Caja' }, { id: 2, codigo: '110201', nombre: 'Banco BHD' },
    { id: 3, codigo: '1106', nombre: 'Cobros por liquidar' }, { id: 4, codigo: '1205', nombre: 'Mobiliario' },
    { id: 5, codigo: '1209', nombre: 'Dep. acum. mobiliario' },
  ];
  return { catalogoImputable: async () => ({ imputables: new Map(lista.map((c) => [c.id, c])), porCodigo: new Map() }) };
});

import { POST } from '@/app/api/contabilidad/activos-fijos/route';
import { requirePermission } from '@/lib/auth/api-guard';

const base = { nombre: 'X', costoCents: 100000, vidaUtilMeses: 12, fechaAdquisicion: '2026-10-01' };
const llamar = (extra: object) => POST(new Request('http://x', { method: 'POST', body: JSON.stringify({ ...base, ...extra }) }) as never);

describe('POST /api/contabilidad/activos-fijos', () => {
  it('pide permiso de escritura', async () => {
    await llamar({});
    expect(requirePermission).toHaveBeenCalledWith('contabilidad:gestionar', { escritura: true });
  });
  it('una cuenta ajena o que no existe da 400', async () => {
    expect((await llamar({ cuentaPagoId: 999 })).status).toBe(400);
  });
  it('«Cobros por liquidar» no vale como caja o banco', async () => {
    expect((await llamar({ cuentaPagoId: 3 })).status).toBe(400);
  });
  it('un banco sí', async () => {
    expect((await llamar({ cuentaPagoId: 2 })).status).toBe(200);
  });
  it('ya en libros: la cuenta tiene que ser de activo fijo, no de depreciación acumulada', async () => {
    expect((await llamar({ libros: { cuentaActivoId: 5 } })).status).toBe(400);
    expect((await llamar({ libros: { cuentaActivoId: 4 } })).status).toBe(200);
  });
  it('pago y libros juntos dan 400', async () => {
    expect((await llamar({ cuentaPagoId: 2, libros: { cuentaActivoId: null } })).status).toBe(400);
  });
  it('helpers de familias de cuenta', () => {
    expect(esCuentaCajaBanco('1106')).toBe(false);
    expect(esCuentaCajaBanco('110201')).toBe(true);
    expect(esCuentaDeActivoFijo('1209')).toBe(false);
    expect(esCuentaDeActivoFijo('1207')).toBe(true);
  });
});
