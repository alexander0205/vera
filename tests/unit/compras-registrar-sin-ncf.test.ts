/**
 * El servidor guarda un gasto sin NCF, y con NCF hace lo de siempre.
 *
 * `compras-sin-ncf.test.ts` prueba la regla pura. Aquí se ejecuta
 * `registrarCompra` de verdad, con la base de mentira, para ver qué fila
 * escribe: relajar el formulario no sirve de nada si el servidor dice otra
 * cosa, y es el servidor el que recibe una llamada directa a la API.
 *
 * Todos los nombres, RNC y cédulas son inventados (los RNC, con el dígito
 * verificador mal a propósito).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const base = vi.hoisted(() => ({
  /** Lo que la base contesta a «¿ya está registrado este NCF?». */
  repetidos: [] as { id: number }[],
  consultasNcf: 0,
  compras: [] as Record<string, unknown>[],
  lineas: [] as Record<string, unknown>[],
  entradas: 0,
}));

vi.mock('@/lib/db/drizzle', () => {
  const tx = {
    insert: () => ({
      values: (v: unknown) => {
        // Las líneas llegan en un arreglo y no devuelven nada; la compra, sola y con su id.
        if (Array.isArray(v)) { base.lineas.push(...(v as Record<string, unknown>[])); return Promise.resolve(); }
        base.compras.push(v as Record<string, unknown>);
        return { returning: async () => [{ id: 77 }] };
      },
    }),
  };
  const sinFilas = () => {
    const c: Record<string, unknown> = {};
    for (const m of ['from', 'where', 'limit', 'orderBy']) c[m] = () => c;
    (c as { then: unknown }).then = (resolver: (filas: unknown[]) => void) => resolver([]);
    return c;
  };
  return {
    db: {
      execute: async () => { base.consultasNcf += 1; return base.repetidos; },
      select: () => sinFilas(),
      transaction: async (fn: (t: typeof tx) => unknown) => fn(tx),
    },
  };
});
vi.mock('@/lib/contabilidad/config', () => ({
  // Una empresa que cobra ITBIS: es donde llevar el ITBIS al costo no sale solo.
  getConfig: async () => ({ regimenItbis: 'gravado' }),
  catalogoImputable: async () => ({ imputables: new Set<number>() }),
  cuentasDeSalida: async () => ({ cuentas: [], porMetodo: {} }),
}));
vi.mock('@/lib/contabilidad/asientos', () => ({
  generarAsientoCompra: async () => ({ creado: false }),
  generarAsientoCompraAnulada: async () => ({ creado: false }),
}));
vi.mock('@/lib/inventario/entrada', () => ({
  registrarEntradas: async () => { base.entradas += 1; },
  revertirEntradas: async () => {},
}));

const { registrarCompra } = await import('@/lib/compras/registrar');
const { avisoRetencionSinNcf } = await import('@/lib/compras/fiscal');
type Registro = Parameters<typeof registrarCompra>[2];

/** El caso del dueño: un contratista del exterior, sin NCF ni RNC, que no cobra ITBIS. */
const gasto = (p: Partial<Registro> = {}): Registro => ({
  clase: 'gasto', proveedorRnc: null, proveedorNombre: 'CONTRATISTA DE PRUEBA LLC', tipoProveedor: 'exterior',
  ncf: null, fecha: '2026-01-15',
  lineas: [{ descripcion: 'Servicios de desarrollo', categoria: 'honorarios', cantidad: 1, costoUnitarioCents: 5_800_000, itbisTasa: 'exento' }],
  itbisRetenidoCents: 0, isrRetenidoCents: 0, iscCents: 0, otrosImpuestosCents: 0, propinaCents: 0,
  formaPago: 'contado', metodoPago: 'transferencia', fechaPago: '2026-01-15',
  ...p,
});
const conItbis: Registro['lineas'] = [{ descripcion: 'Reparación', categoria: 'tecnicos', cantidad: 1, costoUnitarioCents: 1_000_000, itbisTasa: '0.18' }];

beforeEach(() => {
  base.repetidos = [];
  base.consultasNcf = 0;
  base.compras = [];
  base.lineas = [];
  base.entradas = 0;
});

describe('gasto sin NCF', () => {
  it('se guarda sin NCF y sin RNC: la referencia queda en NULL y el tipo del 606 se guarda igual', async () => {
    const r = await registrarCompra(1, 2, gasto());
    expect(r.compraId).toBe(77);
    expect(base.compras).toHaveLength(1);
    expect(base.compras[0]).toMatchObject({
      clase: 'gasto', referenciaEncf: null, proveedorRnc: null, proveedorNombre: 'CONTRATISTA DE PRUEBA LLC',
      // Sin tipo, el asiento lo tomaría por una compra vieja y adelantaría el ITBIS.
      tipoBienes606: '02', montoTotal: 5_800_000, estadoPago: 'PAGADA',
    });
    expect(base.lineas).toHaveLength(1);
    expect(r.avisos).toContain('Sin NCF: este gasto se guardó, pero no va al 606 ni da crédito de ITBIS');
  });

  it('da igual que el NCF llegue null, vacío o en blanco: nunca se guarda una cadena vacía', async () => {
    for (const ncf of [null, '', '   ']) {
      base.compras = [];
      await registrarCompra(1, 2, gasto({ ncf }));
      expect(base.compras[0].referenciaEncf).toBeNull();
    }
  });

  it('no se busca repetido: sin número no hay con qué', async () => {
    base.repetidos = [{ id: 9 }];
    await registrarCompra(1, 2, gasto());
    expect(base.consultasNcf).toBe(0);
    expect(base.compras).toHaveLength(1);
  });

  it('todo el ITBIS va al costo aunque la empresa cobre ITBIS, y no se acepta menos', async () => {
    await registrarCompra(1, 2, gasto({ lineas: conItbis }));
    expect(base.compras[0]).toMatchObject({ itbisCents: 180_000, itbisAlCostoCents: 180_000 });

    base.compras = [];
    await expect(registrarCompra(1, 2, gasto({ lineas: conItbis, itbisAlCostoCents: 0 })))
      .rejects.toThrow('Sin NCF el ITBIS no da crédito: va completo al costo');
    expect(base.compras).toHaveLength(0);
  });

  it('el RNC es opcional, pero a medias no pasa', async () => {
    await expect(registrarCompra(1, 2, gasto({ tipoProveedor: 'juridica', proveedorRnc: '12345' })))
      .rejects.toMatchObject({ codigo: 'rnc-invalido', status: 400 });
    await registrarCompra(1, 2, gasto({ tipoProveedor: 'juridica', proveedorRnc: '123-45678-9' }));
    expect(base.compras[0]).toMatchObject({ referenciaEncf: null, proveedorRnc: '123456789' });
  });

  it('el nombre del proveedor sigue obligatorio', async () => {
    await expect(registrarCompra(1, 2, gasto({ proveedorNombre: '  ' }))).rejects.toMatchObject({ codigo: 'proveedor' });
    expect(base.compras).toHaveLength(0);
  });

  it('una retención anotada se guarda y se avisa con el mismo texto del formulario', async () => {
    const r = await registrarCompra(1, 2, gasto({ isrRetenidoCents: 1_566_000, isrTipoRetencion: 3 }));
    expect(base.compras[0]).toMatchObject({ isrRetenidoCents: 1_566_000, isrTipoRetencion: 3, referenciaEncf: null });
    expect(r.avisos).toContain(avisoRetencionSinNcf('exterior'));
    expect(r.avisos.join(' ')).toContain('ni en el 609');
    // Sin retención no se menciona.
    const sin = await registrarCompra(1, 2, gasto());
    expect(sin.avisos.join(' ')).not.toContain('retenido');
  });
});

describe('lo que no cambia', () => {
  it('un NCF a medias sigue siendo un error, no un gasto sin NCF', async () => {
    await expect(registrarCompra(1, 2, gasto({ ncf: 'B01123' }))).rejects.toMatchObject({ codigo: 'ncf-invalido', status: 400 });
    expect(base.compras).toHaveLength(0);
  });

  it('una compra de inventario sigue pidiendo NCF', async () => {
    await expect(registrarCompra(1, 2, gasto({ clase: 'compra' })))
      .rejects.toMatchObject({ codigo: 'ncf-invalido', message: 'Escribe el NCF del comprobante' });
  });

  it('y un «gasto» con productos del inventario también: decide la línea, no la etiqueta', async () => {
    const mercancia: Registro['lineas'] = [{ productoId: 5, cantidad: 10, costoUnitarioCents: 10_000, itbisTasa: '0.18' }];
    await expect(registrarCompra(1, 2, gasto({ lineas: mercancia })))
      .rejects.toMatchObject({ codigo: 'ncf-invalido', message: 'Escribe el NCF del comprobante' });
    expect(base.compras).toHaveLength(0);
    expect(base.entradas).toBe(0);
  });

  it('con NCF se guarda como antes: referencia, RNC obligatorio, ITBIS que se adelanta', async () => {
    const conNcf = gasto({ ncf: 'b0100000123', tipoProveedor: 'juridica', proveedorRnc: '123456789', proveedorNombre: 'PROVEEDOR DE PRUEBA SRL', lineas: conItbis });
    const r = await registrarCompra(1, 2, conNcf);
    expect(base.consultasNcf).toBe(1);
    expect(base.compras[0]).toMatchObject({ referenciaEncf: 'B0100000123', proveedorRnc: '123456789', itbisCents: 180_000, itbisAlCostoCents: 0 });
    expect(r.avisos.join(' ')).not.toContain('Sin NCF');

    await expect(registrarCompra(1, 2, { ...conNcf, proveedorRnc: null }))
      .rejects.toMatchObject({ codigo: 'rnc-invalido', message: 'Escribe el RNC (9 dígitos) o la cédula (11) del proveedor' });
  });

  it('con NCF el repetido se sigue frenando', async () => {
    base.repetidos = [{ id: 9 }];
    const conNcf = gasto({ ncf: 'B0100000123', tipoProveedor: 'juridica', proveedorRnc: '123456789', lineas: conItbis });
    await expect(registrarCompra(1, 2, conNcf)).rejects.toMatchObject({ codigo: 'ncf-repetido', status: 409, compraId: 9 });
    expect(base.compras).toHaveLength(0);
  });
});
