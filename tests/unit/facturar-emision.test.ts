// tests/unit/facturar-emision.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Las consultas se sirven de una lista que cada prueba prepara. La cadena real
 * es select().from().innerJoin().innerJoin().where().orderBy(), y todos los
 * eslabones devuelven el mismo objeto: lo que importa es qué filas salen al
 * final, no por cuántos joins pasaron.
 */
let cargosDevueltos: unknown[] = [];
let insertados: Record<string, unknown>[] = [];
/** Cuántos cargos deja enlazar el UPDATE. -1 = todos los pedidos. */
let enlazaSolo = -1;

vi.mock('@/lib/db/drizzle', () => {
  const cadena: Record<string, unknown> = {};
  cadena.from = () => cadena;
  cadena.innerJoin = () => cadena;
  cadena.leftJoin = () => cadena;
  cadena.where = () => cadena;
  cadena.orderBy = () => Promise.resolve(cargosDevueltos);
  cadena.limit = () => Promise.resolve(cargosDevueltos);

  const tx = {
    execute: () => Promise.resolve([]),
    insert: () => ({
      values: (v: Record<string, unknown>) => {
        insertados.push(v);
        return { returning: () => Promise.resolve([{ id: 900 + insertados.length }]) };
      },
    }),
    update: () => ({
      set: () => ({
        where: () => ({
          returning: () => Promise.resolve(
            (enlazaSolo < 0 ? ultimoPedido : ultimoPedido.slice(0, enlazaSolo)).map((id) => ({ id })),
          ),
        }),
      }),
    }),
  };

  return {
    db: {
      select: () => cadena,
      transaction: (fn: (t: typeof tx) => unknown) => Promise.resolve(fn(tx)),
    },
  };
});

/** Los cargos que el prefill vio en la última llamada, para el mock del UPDATE. */
let ultimoPedido: number[] = [];

vi.mock('@/lib/administracion-escolar/prefill-factura', () => ({
  prefillDeCargos: vi.fn(async (_teamId: number, cargoIds: number[]) => {
    ultimoPedido = cargoIds;
    return {
      ok: true as const,
      datos: {
        comprador: { clienteId: 55, razonSocial: 'Ana Familia', rnc: '40211112222', email: 'ana@x.do', telefono: null, origen: 'guardado', relacion: null },
        // El prefill ofrece SIEMPRE más de lo pedido (los otros cargos cobrables
        // de los hermanos): el cargo 999 comprueba que no se cuelen.
        opciones: [...cargoIds, 999].map((id) => ({
          cargoId: id,
          linea: {
            productoId: 507, nombreItem: 'CUOTA MENSUAL', cantidadItem: 1,
            precioUnitarioItem: 10000, tasaItbis: 'exento',
            indicadorBienoServicio: '2', dependienteId: id, dependienteNombre: `Hijo ${id}`,
          },
        })),
      },
    };
  }),
}));

vi.mock('@/lib/facturas/codigo', () => ({
  generarCodigoFactura: vi.fn(async () => 'FA-2026-TEST-000001'),
}));

const { facturarCuotasEmitidas } = await import('@/lib/administracion-escolar/facturar-emision');
const { prefillDeCargos } = await import('@/lib/administracion-escolar/prefill-factura');

const cargo = (id: number, clienteId: number | null, vence = '2026-09-05') => ({
  id, estudianteId: id, saldoCentavos: 1000000, fechaVencimiento: vence,
  fechaEmision: '2026-09-01', clienteId,
});

beforeEach(() => {
  cargosDevueltos = [];
  insertados = [];
  ultimoPedido = [];
  enlazaSolo = -1;
  vi.mocked(prefillDeCargos).mockClear();
});

describe('facturarCuotasEmitidas', () => {
  it('rango al revés → no hace nada', async () => {
    const r = await facturarCuotasEmitidas(1, 1, { desde: '2026-09-05', hasta: '2026-09-01' });
    expect(r.facturas).toHaveLength(0);
    expect(prefillDeCargos).not.toHaveBeenCalled();
  });

  it('sin cargos emitidos en el rango → no crea ninguna factura', async () => {
    const r = await facturarCuotasEmitidas(1, 1, { desde: '2026-09-01', hasta: '2026-09-01' });
    expect(r.facturas).toHaveLength(0);
    expect(insertados).toHaveLength(0);
  });

  /**
   * La regla central: una factura por RESPONSABLE, no por alumno. Tres hermanos
   * del mismo pagador son un documento de tres líneas — es lo que hizo a mano la
   * secretaria de Amisadai (57 facturas para 74 cargos).
   */
  it('agrupa por responsable de pago: 3 hermanos → 1 factura de 3 líneas', async () => {
    cargosDevueltos = [cargo(1, 55), cargo(2, 55), cargo(3, 55)];
    const r = await facturarCuotasEmitidas(1, 1, { desde: '2026-09-01', hasta: '2026-09-01' });

    expect(r.facturas).toHaveLength(1);
    expect(r.cargosFacturados).toBe(3);
    expect(r.facturas[0].cargoIds).toEqual([1, 2, 3]);
    expect(JSON.parse(insertados[0].lineasJson as string)).toHaveLength(3);
  });

  it('dos familias → dos facturas, cada una con lo suyo', async () => {
    cargosDevueltos = [cargo(1, 55), cargo(2, 77), cargo(3, 55)];
    const r = await facturarCuotasEmitidas(1, 1, { desde: '2026-09-01', hasta: '2026-09-01' });

    expect(r.facturas).toHaveLength(2);
    expect(r.facturas.map((f) => f.cargoIds)).toEqual([[1, 3], [2]]);
  });

  it('no arrastra los cargos que el prefill ofrece de más', async () => {
    cargosDevueltos = [cargo(1, 55)];
    await facturarCuotasEmitidas(1, 1, { desde: '2026-09-01', hasta: '2026-09-01' });
    // El prefill devolvió también el 999; la factura lleva UNA línea.
    expect(JSON.parse(insertados[0].lineasJson as string)).toHaveLength(1);
  });

  it('nace BORRADOR sin-ncf, a crédito y sin e-NCF inventado', async () => {
    cargosDevueltos = [cargo(1, 55)];
    await facturarCuotasEmitidas(1, 1, { desde: '2026-09-01', hasta: '2026-09-01' });

    expect(insertados[0]).toMatchObject({
      estado: 'BORRADOR', estadoPago: 'PENDIENTE', tipoEcf: 'sin-ncf',
      encf: '', tipoPago: 2, clientId: 55, rncComprador: '40211112222',
    });
  });

  it('el plazo de la factura es el del cargo que vence más tarde', async () => {
    cargosDevueltos = [cargo(1, 55, '2026-09-05'), cargo(2, 55, '2026-09-20')];
    await facturarCuotasEmitidas(1, 1, { desde: '2026-09-01', hasta: '2026-09-01' });
    expect(insertados[0].fechaLimitePago).toBe('2026-09-20');
  });

  it('sin plazo en ningún cargo, la factura sale de contado', async () => {
    cargosDevueltos = [{ ...cargo(1, 55), fechaVencimiento: null }];
    await facturarCuotasEmitidas(1, 1, { desde: '2026-09-01', hasta: '2026-09-01' });
    expect(insertados[0]).toMatchObject({ tipoPago: 1, fechaLimitePago: null });
  });

  it('alumno sin responsable de pago: no se factura y queda dicho por qué', async () => {
    cargosDevueltos = [cargo(1, null), cargo(2, 55)];
    const r = await facturarCuotasEmitidas(1, 1, { desde: '2026-09-01', hasta: '2026-09-01' });

    expect(r.facturas).toHaveLength(1);
    expect(r.diagnostico).toEqual([
      expect.objectContaining({ motivo: 'sin-responsable', cargoIds: [1] }),
    ]);
  });

  /**
   * El candado contra la doble factura. Si entre leer los cargos y enlazarlos
   * otra corrida se llevó alguno, el UPDATE toca menos filas de las pedidas y
   * toda la transacción se cae: mejor sin factura que con el mismo cargo
   * cobrado en dos documentos.
   */
  it('si alguien facturó un cargo por el medio, la factura no se crea', async () => {
    cargosDevueltos = [cargo(1, 55), cargo(2, 55)];
    enlazaSolo = 1; // solo uno de los dos seguía sin factura
    const r = await facturarCuotasEmitidas(1, 1, { desde: '2026-09-01', hasta: '2026-09-01' });

    expect(r.facturas).toHaveLength(0);
    expect(r.diagnostico[0]).toMatchObject({ motivo: 'error' });
    expect(r.diagnostico[0].detalle).toContain('seguían sin factura');
  });

  it('una familia con la ficha rota no tumba a las demás', async () => {
    cargosDevueltos = [cargo(1, 55), cargo(2, 77)];
    vi.mocked(prefillDeCargos).mockImplementationOnce(async () => ({
      ok: false as const, status: 400, error: 'El estudiante no tiene responsable de pago asignado',
    }));

    const r = await facturarCuotasEmitidas(1, 1, { desde: '2026-09-01', hasta: '2026-09-01' });
    expect(r.facturas).toHaveLength(1);
    expect(r.diagnostico[0]).toMatchObject({ motivo: 'prefill-rechazado', cargoIds: [1] });
  });
});
