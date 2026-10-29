import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Aprobar un comprobante dice en QUÉ banco entró el dinero.
 *
 * Es lo que pidió el colegio: en la pantalla de aprobación de pago tiene que
 * quedar registrado en cuál cuenta se depositó. Aquí se prueba el cableado que
 * esa pantalla no puede probar sola:
 *
 *  · el banco elegido viaja al cobro (`cuenta_banco_id` y la etiqueta `cuenta`),
 *    igual que en un cobro manual;
 *  · un id que no es de ESTE colegio se rechaza ANTES de tocar nada —el id viene
 *    del navegador—;
 *  · con varias cuentas, una transferencia sin banco no se aprueba;
 *  · si el cobro revienta, el comprobante vuelve a la cola sin banco.
 *
 * La base está mockeada: lo que se mira es lo que `aprobarComprobante` le pide.
 */

const m = vi.hoisted(() => ({
  /** Resultados de los SELECT, en orden: los cargos vivos y luego los saldos. */
  selects: [] as unknown[][],
  /** Lo que se le pidió a cada UPDATE de comprobantes. */
  updates: [] as Record<string, unknown>[],
  /** Lo que devuelve el UPDATE ... RETURNING que reclama la fila (undefined = ya la revisaron). */
  fila: undefined as Record<string, unknown> | undefined,
  registrarPago: vi.fn(),
  sincronizar: vi.fn(),
  cuentas: [] as Array<{
    id: number; banco: string; tipoCuenta: string | null; ultimos4: string | null;
    titular: string | null; etiqueta: string; activa: boolean;
  }>,
}));

vi.mock('@/lib/db/drizzle', () => {
  const select = () => {
    const cadena: Record<string, unknown> = {};
    for (const metodo of ['from', 'innerJoin', 'leftJoin', 'where', 'orderBy', 'limit']) {
      cadena[metodo] = () => cadena;
    }
    (cadena as { then: unknown }).then = (resolver: (v: unknown[]) => void) => resolver(m.selects.shift() ?? []);
    return cadena;
  };
  return {
    db: {
      select,
      update: () => ({
        set: (valores: Record<string, unknown>) => {
          m.updates.push(valores);
          const donde: Record<string, unknown> = {
            returning: async () => (m.fila ? [m.fila] : []),
          };
          (donde as { then: unknown }).then = (resolver: (v: unknown[]) => void) => resolver([]);
          return { where: () => donde };
        },
      }),
    },
  };
});

vi.mock('@/lib/db/queries', () => ({ registrarPago: m.registrarPago }));
vi.mock('@/lib/administracion-escolar/queries', () => ({ sincronizarSaldosDesdeFacturas: m.sincronizar }));
vi.mock('@/lib/storage/comprobantes', () => ({ leerComprobante: vi.fn() }));
vi.mock('@/lib/pagos/cuentas-banco', () => ({ cuentasBancoDelEquipo: async () => m.cuentas }));

import {
  aprobarComprobante, ComprobanteError, ComprobanteSolicitudError,
} from '@/lib/administracion-escolar/comprobantes';

const cuenta = (id: number, banco: string, fin: string, activa = true) => ({
  id, banco, tipoCuenta: 'Ahorros', ultimos4: fin, titular: null,
  etiqueta: `${banco} · Ahorros ····${fin}`, activa,
});

beforeEach(() => {
  m.selects = [
    // planDeAplicacion: los cargos vivos…
    [{
      id: 1, ecfDocumentId: 100, saldoCentavos: 480000, fechaVencimiento: '2026-10-05',
      concepto: 'Mensualidad', nombres: 'Ana', encf: '', codigo: 'F-1',
    }],
    // …y el saldo real de su factura.
    [{ id: 100, saldo: 480000 }],
  ];
  m.updates = [];
  m.fila = {
    id: 5, teamId: 3, estado: 'aprobado', montoCentavos: 480000, referencia: 'REF-1',
    cargos: [{ cargoId: 1, estudiante: 'Ana', concepto: 'Mensualidad', montoCentavos: 480000, fechaVencimiento: '2026-10-05' }],
    moras: [],
  };
  m.registrarPago.mockReset();
  m.registrarPago.mockResolvedValue({});
  m.sincronizar.mockReset();
  m.cuentas = [cuenta(1, 'Banco Popular', '4821'), cuenta(2, 'Banco BHD', '9034')];
});

describe('el banco elegido llega al cobro', () => {
  it('registra el cobro con la cuenta (id y etiqueta) y la deja en el comprobante', async () => {
    const r = await aprobarComprobante(3, 5, 41, { metodo: 'transferencia', cuentaBancoId: 2 });

    expect(r.aplicadoCentavos).toBe(480000);
    expect(m.registrarPago).toHaveBeenCalledTimes(1);
    expect(m.registrarPago.mock.calls[0][0]).toMatchObject({
      teamId: 3,
      ecfDocumentId: 100,
      montoCentavos: 480000,
      metodo: 'transferencia',
      cuentaBancoId: 2,
      cuenta: 'Banco BHD · Ahorros ····9034',
    });
    // El UPDATE que reclama la fila ya lleva el banco.
    expect(m.updates[0]).toMatchObject({ estado: 'aprobado', revisadoPor: 41, cuentaBancoId: 2 });
  });

  it('con UNA sola cuenta y sin id, se aprueba como siempre (no hay nada que elegir)', async () => {
    m.cuentas = [cuenta(1, 'Banco Popular', '4821')];
    await aprobarComprobante(3, 5, 41, { metodo: 'transferencia' });

    expect(m.registrarPago.mock.calls[0][0]).toMatchObject({ cuentaBancoId: null, cuenta: null });
  });

  it('sin cuentas cargadas se aprueba como siempre', async () => {
    m.cuentas = [];
    await aprobarComprobante(3, 5, 41, {});
    expect(m.registrarPago).toHaveBeenCalledTimes(1);
  });

  it('en efectivo no se exige banco aunque haya varias cuentas', async () => {
    await aprobarComprobante(3, 5, 41, { metodo: 'efectivo' });
    expect(m.registrarPago.mock.calls[0][0]).toMatchObject({ metodo: 'efectivo', cuentaBancoId: null });
  });
});

describe('lo que NO se aprueba', () => {
  /** El id viaja desde el navegador: ataría el cobro a la cuenta de otra empresa. */
  it('una cuenta que no es de este colegio se rechaza antes de tocar nada', async () => {
    const e = await aprobarComprobante(3, 5, 41, { metodo: 'transferencia', cuentaBancoId: 999 })
      .catch((x) => x);

    expect(e).toBeInstanceOf(ComprobanteSolicitudError);
    expect(e).toBeInstanceOf(ComprobanteError);
    expect(e.status).toBe(400);
    expect(m.updates).toHaveLength(0);
    expect(m.registrarPago).not.toHaveBeenCalled();
  });

  it('con varias cuentas, una transferencia sin banco pide elegirlo', async () => {
    const e = await aprobarComprobante(3, 5, 41, { metodo: 'transferencia' }).catch((x) => x);

    expect(e).toBeInstanceOf(ComprobanteSolicitudError);
    expect(e.message).toBe('Elige el banco donde entró el dinero.');
    expect(m.updates).toHaveLength(0);
    expect(m.registrarPago).not.toHaveBeenCalled();
  });

  it('el método por defecto es transferencia: también pide banco', async () => {
    await expect(aprobarComprobante(3, 5, 41, {})).rejects.toThrow('Elige el banco');
  });

  it('un comprobante que ya revisaron sigue dando 409, no 400', async () => {
    m.fila = undefined;
    const e = await aprobarComprobante(3, 5, 41, { metodo: 'transferencia', cuentaBancoId: 1 })
      .catch((x) => x);

    expect(e).toBeInstanceOf(ComprobanteError);
    expect(e).not.toBeInstanceOf(ComprobanteSolicitudError);
    expect(e.status).toBe(409);
    expect(m.registrarPago).not.toHaveBeenCalled();
  });
});

describe('si el cobro revienta', () => {
  it('el comprobante vuelve a la cola, sin banco ni revisor', async () => {
    m.registrarPago.mockRejectedValue(new Error('la factura se anuló entremedio'));

    await expect(aprobarComprobante(3, 5, 41, { metodo: 'transferencia', cuentaBancoId: 1 }))
      .rejects.toThrow('la factura se anuló');

    expect(m.updates).toHaveLength(2);
    expect(m.updates[1]).toMatchObject({
      estado: 'pendiente', revisadoPor: null, revisadoEn: null, cuentaBancoId: null,
    });
  });
});
