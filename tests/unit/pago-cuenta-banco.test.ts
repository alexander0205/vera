// tests/unit/pago-cuenta-banco.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * A qué CUENTA de la empresa entró un cobro.
 *
 * `cuenta_banco_id` viaja desde el navegador, así que sin comprobarlo se podría
 * atar un cobro a la cuenta bancaria de OTRA empresa — y con ella aparecería en
 * su reporte de «cuánto entró por esta cuenta». El candado vive en
 * `registrarPagosSplit` (ver migración 0173) y esto es su prueba de regresión:
 * es la clase de comprobación que se cae sin hacer ruido al refactorizar.
 *
 * La regla, además, no es «rechazar el cobro»: un id ajeno se guarda como null
 * y el pago entra igual con su etiqueta. Tumbar un cobro legítimo por una
 * referencia mala sería peor que perder la referencia.
 */

const estado = vi.hoisted(() => ({
  /** Ids que la base dirá que SÍ son del equipo consultado. */
  cuentasDelEquipo: [] as number[],
  insertados: [] as Record<string, unknown>[],
  /** Cuántos SELECT van; el tercero es el de las cuentas. */
  turno: 0,
}));

vi.mock('@/lib/db/drizzle', () => {
  const cadena = () => {
    const obj: Record<string, unknown> = {};
    for (const m of ['from', 'innerJoin', 'leftJoin', 'where', 'orderBy', 'limit', 'groupBy']) {
      obj[m] = () => obj;
    }
    (obj as { then: unknown }).then = (resolve: (v: unknown[]) => void) => {
      estado.turno += 1;
      // 1º el documento, 2º lo ya pagado, 3º las cuentas del equipo. Del 4º en
      // adelante es `syncPagoMirror`, que vive en el mismo módulo y no se puede
      // mockear aparte: con filas vacías toma su rama nula y no estorba.
      if (estado.turno === 1) return resolve([{ id: 55, montoTotal: 500000, encf: '', tipoEcf: '31' }]);
      if (estado.turno === 2) return resolve([{ pagado: 0 }]);
      if (estado.turno === 3) return resolve(estado.cuentasDelEquipo.map(id => ({ id })));
      return resolve([]);
    };
    return obj;
  };

  return {
    db: {
      select: () => cadena(),
      execute: async () => ({ rows: [{ total: '0' }] }),
      insert: () => ({
        values: (filas: Record<string, unknown>[]) => ({
          returning: async () => { estado.insertados = filas; return filas; },
        }),
      }),
      update: () => ({ set: () => ({ where: async () => [] }) }),
    },
  };
});

// Estas dos tocan otras tablas y no son lo que se prueba aquí.
vi.mock('@/lib/facturas/estado-pago', () => ({ syncPagoMirror: async () => {} }));
vi.mock('@/lib/facturas/notas-credito', () => ({ getNcAplicadoCts: async () => 0 }));

beforeEach(() => {
  estado.cuentasDelEquipo = [];
  estado.insertados = [];
  estado.turno = 0;
});

async function registrar(cuentaBancoId: number | null) {
  const { registrarPagosSplit } = await import('@/lib/db/queries');
  return registrarPagosSplit({
    teamId: 2,
    ecfDocumentId: 55,
    fechaPago: '2026-09-07',
    pagos: [{
      montoCentavos: 1000,
      metodo: 'transferencia',
      cuenta: 'Banco Popular · Corriente ····8105',
      cuentaBancoId,
    }],
  });
}

describe('cuenta bancaria de un cobro', () => {
  it('guarda la referencia cuando la cuenta ES del equipo', async () => {
    estado.cuentasDelEquipo = [7];
    await registrar(7);
    expect(estado.insertados[0].cuentaBancoId).toBe(7);
  });

  it('descarta la referencia cuando la cuenta es de OTRA empresa', async () => {
    // La base no devuelve la 1 para el team 2: no es suya.
    estado.cuentasDelEquipo = [];
    await registrar(1);
    expect(estado.insertados[0].cuentaBancoId).toBeNull();
    // Pero el cobro entra igual, y con su etiqueta: perder la referencia no
    // puede costarle a nadie el registro del dinero.
    expect(estado.insertados[0].montoCentavos).toBe(1000);
    expect(estado.insertados[0].cuenta).toBe('Banco Popular · Corriente ····8105');
  });

  it('sin cuenta elegida no guarda referencia', async () => {
    estado.cuentasDelEquipo = [7];
    await registrar(null);
    expect(estado.insertados[0].cuentaBancoId).toBeNull();
  });
});
