/**
 * POST /api/compras/local con un gasto sin NCF.
 *
 * Dos cosas que solo se ven en la ruta:
 *
 *  · el cuerpo puede venir sin NCF (ausente, null o vacío) y llega así a
 *    `registrarCompra`, que es quien decide;
 *  · una factura fotografiada no se registra dos veces. Con NCF lo frena el
 *    aviso de NCF repetido; sin NCF no hay número que comparar, así que la ruta
 *    mira si la captura sigue «por revisar» antes de guardar otro gasto.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/auth/api-guard', () => ({
  requirePermission: vi.fn(async () => ({ ok: true, teamId: 1, user: { id: 2 }, teamRole: 'owner' })),
}));
vi.mock('@/lib/compras/registrar', () => {
  class CompraError extends Error {
    status: number;
    codigo?: string;
    compraId?: number;
    constructor(message: string, status = 400, codigo?: string, compraId?: number) {
      super(message);
      this.status = status;
      this.codigo = codigo;
      this.compraId = compraId;
    }
  }
  return { CompraError, registrarCompra: vi.fn(async () => ({ compraId: 77, asiento: { creado: false }, avisos: [] })) };
});
vi.mock('@/lib/compras/consultas', () => ({ listarCompras: vi.fn(async () => []) }));
vi.mock('@/lib/compras/captura/consultas', () => ({
  estadoCaptura: vi.fn(),
  marcarRegistrada: vi.fn(async () => true),
}));

const { registrarCompra } = await import('@/lib/compras/registrar');
const { estadoCaptura, marcarRegistrada } = await import('@/lib/compras/captura/consultas');
const { POST } = await import('@/app/api/compras/local/route');

const cuerpo = (p: Record<string, unknown> = {}) => ({
  clase: 'gasto', proveedorNombre: 'CONTRATISTA DE PRUEBA LLC', tipoProveedor: 'exterior', fecha: '2026-01-15',
  lineas: [{ descripcion: 'Servicios de desarrollo', categoria: 'honorarios', cantidad: 1, costoUnitarioCents: 5_800_000, itbisTasa: 'exento' }],
  formaPago: 'contado', metodoPago: 'transferencia', fechaPago: '2026-01-15',
  ...p,
});
const enviar = (c: Record<string, unknown>) => POST(new NextRequest('http://localhost/api/compras/local', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(c),
}));

beforeEach(() => {
  vi.mocked(registrarCompra).mockClear();
  vi.mocked(estadoCaptura).mockReset();
  vi.mocked(marcarRegistrada).mockClear();
});

describe('el cuerpo puede venir sin NCF', () => {
  it('ausente, null o vacío: se acepta y no se inventa ninguno', async () => {
    for (const c of [cuerpo(), cuerpo({ ncf: null }), cuerpo({ ncf: '' })]) {
      vi.mocked(registrarCompra).mockClear();
      const res = await enviar(c);
      expect(res.status).toBe(201);
      const enviado = vi.mocked(registrarCompra).mock.calls[0][2];
      expect(enviado.ncf || null).toBeNull();
      expect(enviado.proveedorRnc).toBeNull();
    }
  });

  it('con NCF llega tal cual', async () => {
    await enviar(cuerpo({ ncf: 'B0100000123', proveedorRnc: '123456789' }));
    expect(vi.mocked(registrarCompra).mock.calls[0][2]).toMatchObject({ ncf: 'B0100000123', proveedorRnc: '123456789' });
  });
});

describe('una factura fotografiada no se registra dos veces sin NCF', () => {
  it('si la captura ya se registró, no se guarda otro gasto', async () => {
    vi.mocked(estadoCaptura).mockResolvedValue({ estado: 'registrada', compraId: 40 });
    const res = await enviar(cuerpo({ capturaId: 7 }));
    expect(res.status).toBe(409);
    const j = await res.json();
    expect(j.error).toBe('Esta factura ya se registró (gasto #40)');
    expect(j.codigo).toBe('captura-no-disponible');
    expect(registrarCompra).not.toHaveBeenCalled();
    expect(marcarRegistrada).not.toHaveBeenCalled();
  });

  it('tampoco si se descartó o se está leyendo de nuevo', async () => {
    for (const estado of ['descartada', 'procesando'] as const) {
      vi.mocked(estadoCaptura).mockResolvedValue({ estado, compraId: null });
      const res = await enviar(cuerpo({ capturaId: 7 }));
      expect(res.status).toBe(409);
      expect((await res.json()).error).toContain('ya no está por revisar');
    }
    expect(registrarCompra).not.toHaveBeenCalled();
  });

  it('si sigue por revisar, se registra y la captura queda enlazada al gasto', async () => {
    vi.mocked(estadoCaptura).mockResolvedValue({ estado: 'por_revisar', compraId: null });
    const res = await enviar(cuerpo({ capturaId: 7 }));
    expect(res.status).toBe(201);
    expect(estadoCaptura).toHaveBeenCalledWith(1, 7);
    expect(marcarRegistrada).toHaveBeenCalledWith(1, 7, 77, 2);
  });

  it('con NCF no se consulta la captura: sigue mandando el aviso de NCF repetido, como antes', async () => {
    const res = await enviar(cuerpo({ capturaId: 7, ncf: 'B0100000123', proveedorRnc: '123456789' }));
    expect(res.status).toBe(201);
    expect(estadoCaptura).not.toHaveBeenCalled();
    expect(registrarCompra).toHaveBeenCalledTimes(1);
    expect(marcarRegistrada).toHaveBeenCalledWith(1, 7, 77, 2);
  });
});
