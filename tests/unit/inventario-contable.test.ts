/**
 * Inventario contable: costo de ventas, devoluciones, ajustes de stock y el
 * cuadre del valor del inventario contra 1105.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'node:fs';
import { PgDialect } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import {
  costoEfectivo, valorCents, fotoDeCosto, valorDeDevolucion, partidasCostoVenta, partidasAjusteInventario,
  resumenValuacion, partidasCuadreInventario, type CuentasInventario,
} from '@/lib/inventario/costo';

const C: CuentasInventario = { inventarioId: 11, costoVentasId: 51, mermasId: 52, aperturaId: 32 };
const debe = (l: { debeCents: number }[]) => l.reduce((s, x) => s + x.debeCents, 0);
const haber = (l: { haberCents: number }[]) => l.reduce((s, x) => s + x.haberCents, 0);

describe('costo de una venta', () => {
  it('cantidad × costo promedio, redondeado una vez a centavos', () => {
    expect(valorCents(3, 333)).toBe(999);
    expect(valorCents(7, 1234.5)).toBe(8642); // 8641.5 → 8642
    expect(fotoDeCosto(3, 333)).toEqual({ costoUnitarioCents: 333, costoTotalCents: 999 });
  });
  it('sin costo o sin cantidad no hay foto: no se asienta nada', () => {
    expect(fotoDeCosto(3, 0)).toBeNull();
    expect(fotoDeCosto(0, 500)).toBeNull();
  });
  it('la variante manda si tiene costo; si no, el del producto', () => {
    expect(costoEfectivo(500, 700)).toBe(700);
    expect(costoEfectivo(500, 0)).toBe(500);
    expect(costoEfectivo(0, 0)).toBe(0);
  });
  it('venta: Dr 5101 / Cr 1105 por el mismo monto', () => {
    const l = partidasCostoVenta([
      { tipo: 'VENTA', costoTotalCents: 999, descripcion: 'A' },
      { tipo: 'VENTA', costoTotalCents: 1001, descripcion: 'B' },
    ], C);
    expect(l).toHaveLength(2);
    expect(l[0]).toMatchObject({ cuentaId: 51, debeCents: 2000 });
    expect(l[1]).toMatchObject({ cuentaId: 11, haberCents: 2000 });
    expect(debe(l)).toBe(haber(l));
  });
});

describe('reverso por devolución o anulación', () => {
  const venta = [{ tipo: 'VENTA', cantidad: 3, costoTotalCents: 999 }, { tipo: 'VENTA', cantidad: 4, costoTotalCents: 1334 }];
  it('devolver todo es exactamente lo que salió, sin diferencia de redondeo', () => {
    const f = valorDeDevolucion(venta, 7)!;
    expect(f.costoTotalCents).toBe(999 + 1334);
    const original = partidasCostoVenta([{ tipo: 'VENTA', costoTotalCents: 2333, descripcion: 'X' }], C);
    const reverso = partidasCostoVenta([{ tipo: 'DEVOLUCION', costoTotalCents: f.costoTotalCents, descripcion: 'X' }], C);
    expect(reverso.map((l) => [l.cuentaId, l.debeCents, l.haberCents]))
      .toEqual([[11, 2333, 0], [51, 0, 2333]]);
    // Los lados quedan intercambiados respecto al original.
    const porCuenta = (l: { cuentaId: number; debeCents: number; haberCents: number }[]) =>
      l.map((x) => [x.cuentaId, x.debeCents, x.haberCents]).sort((a, b) => a[0] - b[0]);
    expect(porCuenta(original).map(([c, d, h]) => [c, h, d])).toEqual(porCuenta(reverso));
  });
  it('una devolución parcial usa el costo de la venta, no el de hoy', () => {
    expect(valorDeDevolucion([{ tipo: 'VENTA', cantidad: 10, costoTotalCents: 5000 }], 4)!.costoTotalCents).toBe(2000);
  });
  it('lo ya devuelto no se devuelve dos veces', () => {
    const previos = [{ tipo: 'VENTA', cantidad: 3, costoTotalCents: 900 }, { tipo: 'DEVOLUCION', cantidad: 3, costoTotalCents: 900 }];
    expect(valorDeDevolucion(previos, 3)).toBeNull();
  });
  it('si la venta no se valoró (anterior a la migración) no hay costo que revertir', () => {
    expect(valorDeDevolucion([{ tipo: 'VENTA', cantidad: 3, costoTotalCents: null }], 3)).toBeNull();
    expect(valorDeDevolucion([], 3)).toBeNull();
  });
  it('devolución parcial y luego el resto suman exactamente la venta', () => {
    const v = { tipo: 'VENTA', cantidad: 3, costoTotalCents: 1000 };
    const a = valorDeDevolucion([v], 1)!;           // 333
    const b = valorDeDevolucion([v, { tipo: 'DEVOLUCION', cantidad: 1, costoTotalCents: a.costoTotalCents }], 2)!;
    expect(a.costoTotalCents + b.costoTotalCents).toBe(1000);
  });
});

describe('ajustes de stock', () => {
  it('merma: Dr 5102 / Cr 1105', () => {
    const l = partidasAjusteInventario('AJUSTE_SALIDA', 1500, 'Merma', C);
    expect(l[0]).toMatchObject({ cuentaId: 52, debeCents: 1500 });
    expect(l[1]).toMatchObject({ cuentaId: 11, haberCents: 1500 });
  });
  it('sobrante y entrada sin factura: Dr 1105 / Cr 5102', () => {
    for (const t of ['AJUSTE_ENTRADA', 'ENTRADA']) {
      const l = partidasAjusteInventario(t, 800, 'x', C);
      expect(l[0]).toMatchObject({ cuentaId: 11, debeCents: 800 });
      expect(l[1]).toMatchObject({ cuentaId: 52, haberCents: 800 });
    }
  });
  it('stock inicial: Dr 1105 / Cr 3102', () => {
    const l = partidasAjusteInventario('STOCK_INICIAL', 9000, 'x', C);
    expect(l[0]).toMatchObject({ cuentaId: 11, debeCents: 9000 });
    expect(l[1]).toMatchObject({ cuentaId: 32, haberCents: 9000 });
    expect(partidasAjusteInventario('STOCK_INICIAL', 0, 'x', C)).toEqual([]);
  });
});

describe('valor del inventario contra 1105', () => {
  const filas = [{ existencia: 10, costoUnitarioCents: 1250 }, { existencia: 3, costoUnitarioCents: 333 }, { existencia: 0, costoUnitarioCents: 999 }];
  it('suma existencia × costo y compara con el libro', () => {
    const r = resumenValuacion(filas, 10000);
    expect(r.valorInventarioCents).toBe(12500 + 999);
    expect(r.diferenciaCents).toBe(3499);
    expect(r.cuadra).toBe(false);
    expect(resumenValuacion(filas, 13499).cuadra).toBe(true);
  });
  it('el asiento de cuadre deja 1105 exactamente en el valor, en los dos sentidos', () => {
    const sobra = partidasCuadreInventario(3499, 11, 32);
    expect(sobra).toMatchObject([{ cuentaId: 11, debeCents: 3499 }, { cuentaId: 32, haberCents: 3499 }]);
    const falta = partidasCuadreInventario(-2000, 11, 51);
    expect(falta).toMatchObject([{ cuentaId: 51, debeCents: 2000 }, { cuentaId: 11, haberCents: 2000 }]);
    // saldo + efecto del asiento = valor
    const neto = (l: { cuentaId: number; debeCents: number; haberCents: number }[]) => l.filter((x) => x.cuentaId === 11).reduce((s, x) => s + x.debeCents - x.haberCents, 0);
    expect(10000 + neto(sobra)).toBe(13499);
    expect(15000 + neto(falta)).toBe(13000);
    expect(partidasCuadreInventario(0, 11, 32)).toEqual([]);
  });
});

// ─── Con base de datos simulada ──────────────────────────────────────────────

const dialect = new PgDialect();
const estado = {
  activa: true,
  mov: { docId: 70, tipo: 'VENTA', asientoId: null as number | null, costo: 2000 as unknown },
  lote: [{ id: 5, costo: 999, nombre: 'Café', fecha: '2026-11-06' }, { id: 6, costo: 1001, nombre: 'Té', fecha: '2026-11-06' }],
  ventaAsentada: true,
  ajuste: { tipo: 'AJUSTE_SALIDA', asientoId: null as number | null, costo: 1500 as unknown, motivo: 'se rompió', nombre: 'Café', fecha: '2026-11-06' },
  conflicto: false,
  asientos: [] as unknown[][],
  lineas: [] as unknown[][],
  marcados: [] as string[],
  consultas: 0,
};

function ejecutar(q: never): unknown[] {
  const { sql: t0, params } = dialect.sqlToQuery(q);
  const t = t0.replace(/\s+/g, ' ').trim();
  estado.consultas++;
  if (t.includes('pg_advisory_xact_lock')) return [];
  if (t.includes('FROM contabilidad_cuentas')) return [{ id: ({ '1105': 11, '5101': 51, '5102': 52, '3102': 32 } as Record<string, number>)[String(params[1])] ?? 99 }];
  if (t.includes('m.tipo, m.asiento_id AS "asientoId"')) return [estado.ajuste];
  if (t.includes('FROM inventory_movements WHERE team_id') && t.includes('FOR UPDATE')) return [{ ok: 1 }];
  if (t.includes('referencia_id AS "docId"')) return [estado.mov];
  if (t.includes('FROM ecf_documents d')) return [{ encf: 'E320000000070', estado: 'ACEPTADO', tipoEcf: '32', fecha: '2026-11-06' }];
  if (t.includes("tipo = 'VENTA' AND asiento_id IS NOT NULL")) return estado.ventaAsentada ? [{ ok: 1 }] : [];
  if (t.includes('SELECT m.id, m.costo_total_cents')) return estado.lote;
  if (t.startsWith('INSERT INTO contabilidad_asientos ')) { estado.asientos.push(params); return estado.conflicto ? [] : [{ id: 900 }]; }
  if (t.startsWith('INSERT INTO contabilidad_asiento_lineas')) { estado.lineas.push(params); return []; }
  if (t.startsWith('UPDATE inventory_movements SET asiento_id')) { estado.marcados.push(t); return params.slice(2).map((id) => ({ id })); }
  return [];
}

vi.mock('@/lib/db/drizzle', () => {
  const tx = { execute: async (q: never) => ejecutar(q) };
  return { db: { execute: async (q: never) => ejecutar(q), transaction: async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx) } };
});
vi.mock('@/lib/contabilidad/config', () => ({ getConfig: async () => ({ activa: estado.activa, cuentaInventarioId: null }) }));
vi.mock('@/lib/contabilidad/catalogo-base', () => ({ asegurarCuentaBase: async () => 77, CODIGO: { inventario: '1105', costoVentas: '5101', mermasInventario: '5102', resultadosAcumulados: '3102' } }));
vi.mock('@/lib/contabilidad/asientos', () => ({ VENTA_ASENTABLE_SQL: sql`1 = 1` }));

beforeEach(() => {
  Object.assign(estado, {
    activa: true, ventaAsentada: true, conflicto: false, asientos: [], lineas: [], marcados: [], consultas: 0,
    mov: { docId: 70, tipo: 'VENTA', asientoId: null, costo: 2000 },
  });
});

describe('asiento del costo de ventas', () => {
  it('crea UN asiento por lote, cuadrado, y marca los movimientos', async () => {
    const { generarAsientoCostoVenta } = await import('@/lib/contabilidad/inventario-asientos');
    const r = await generarAsientoCostoVenta(1, 5, 9);
    expect(r).toEqual({ creado: true, asientoId: 900 });
    expect(estado.asientos).toHaveLength(1);
    const p = estado.asientos[0];
    expect(p).toContain('costo_venta');
    expect(p).toContain(5); // origen_id = el movimiento más bajo del lote
    expect(estado.lineas.map((l) => [l[2], l[3], l[4]])).toEqual([[51, 2000, 0], [11, 0, 2000]]);
    expect(estado.marcados).toHaveLength(1);
  });

  it('el mismo documento dos veces: el segundo choca con el índice único y no duplica ni marca', async () => {
    const { generarAsientoCostoVenta } = await import('@/lib/contabilidad/inventario-asientos');
    estado.conflicto = true;
    const r = await generarAsientoCostoVenta(1, 5, 9);
    expect(r).toEqual({ creado: false, motivo: 'ya-tiene-asiento' });
    expect(estado.lineas).toHaveLength(0);
    expect(estado.marcados).toHaveLength(0);
  });

  it('un movimiento que ya tiene asiento no se vuelve a asentar', async () => {
    const { generarAsientoCostoVenta } = await import('@/lib/contabilidad/inventario-asientos');
    estado.mov.asientoId = 800;
    expect(await generarAsientoCostoVenta(1, 5, 9)).toEqual({ creado: false, motivo: 'ya-tiene-asiento' });
    expect(estado.asientos).toHaveLength(0);
  });

  it('con la contabilidad apagada no se toca la base', async () => {
    const { generarAsientoCostoVenta, generarAsientoAjusteInventario } = await import('@/lib/contabilidad/inventario-asientos');
    estado.activa = false;
    expect(await generarAsientoCostoVenta(1, 5, 9)).toEqual({ creado: false, motivo: 'contabilidad-apagada' });
    expect(await generarAsientoAjusteInventario(1, 5, 9)).toEqual({ creado: false, motivo: 'contabilidad-apagada' });
    expect(estado.consultas).toBe(0);
  });

  it('la devolución es el reverso: Dr 1105 / Cr 5101', async () => {
    const { generarAsientoCostoVenta } = await import('@/lib/contabilidad/inventario-asientos');
    estado.mov.tipo = 'DEVOLUCION';
    const r = await generarAsientoCostoVenta(1, 5, 9);
    expect(r.creado).toBe(true);
    expect(estado.lineas.map((l) => [l[2], l[3], l[4]])).toEqual([[11, 2000, 0], [51, 0, 2000]]);
  });

  it('una devolución sin venta asentada no genera nada (no hay costo que revertir)', async () => {
    const { generarAsientoCostoVenta } = await import('@/lib/contabilidad/inventario-asientos');
    estado.mov.tipo = 'DEVOLUCION';
    estado.ventaAsentada = false;
    expect(await generarAsientoCostoVenta(1, 5, 9)).toEqual({ creado: false, motivo: 'sin-asiento-que-reversar' });
    expect(estado.asientos).toHaveLength(0);
  });
});

describe('asiento de un ajuste de stock', () => {
  const cuentas = () => estado.lineas.map((l) => [l[2], l[3], l[4]]);
  const preparar = (tipo: string, costo: unknown = 1500) => { estado.ajuste = { ...estado.ajuste, tipo, costo, asientoId: null }; };

  it('una merma asienta Dr 5102 / Cr 1105 con el origen ajuste_inventario', async () => {
    const { generarAsientoAjusteInventario } = await import('@/lib/contabilidad/inventario-asientos');
    preparar('AJUSTE_SALIDA');
    expect(await generarAsientoAjusteInventario(1, 8, 9)).toEqual({ creado: true, asientoId: 900 });
    expect(estado.asientos[0]).toContain('ajuste_inventario');
    expect(estado.asientos[0]).toContain(8);
    expect(cuentas()).toEqual([[52, 1500, 0], [11, 0, 1500]]);
  });
  it('el stock inicial va contra 3102', async () => {
    const { generarAsientoAjusteInventario } = await import('@/lib/contabilidad/inventario-asientos');
    preparar('STOCK_INICIAL', 9000);
    await generarAsientoAjusteInventario(1, 8, 9);
    expect(cuentas()).toEqual([[11, 9000, 0], [32, 0, 9000]]);
  });
  it('un ajuste sin foto de costo (histórico o compras) nunca se asienta', async () => {
    const { generarAsientoAjusteInventario } = await import('@/lib/contabilidad/inventario-asientos');
    preparar('AJUSTE_SALIDA', null);
    expect((await generarAsientoAjusteInventario(1, 8, 9)).creado).toBe(false);
    expect(estado.asientos).toHaveLength(0);
  });
  it('doble clic: el segundo choca con el índice único', async () => {
    const { generarAsientoAjusteInventario } = await import('@/lib/contabilidad/inventario-asientos');
    preparar('AJUSTE_ENTRADA'); estado.conflicto = true;
    expect(await generarAsientoAjusteInventario(1, 8, 9)).toEqual({ creado: false, motivo: 'ya-tiene-asiento' });
    expect(estado.marcados).toHaveLength(0);
  });
});

describe('el POS y la factura usan la misma función de descuento', () => {
  const lee = (p: string) => fs.readFileSync(p, 'utf8');
  it('las rutas de venta importan descontarInventario del mismo módulo, que valora el costo', () => {
    for (const ruta of ['app/api/ecf/emitir/route.ts', 'app/api/facturas/[id]/emitir-ecf/route.ts', 'app/api/pos/venta/[id]/editar/route.ts']) {
      expect(lee(ruta)).toContain("from '@/lib/inventario/descuento'");
    }
    const d = lee('lib/inventario/descuento.ts');
    expect(d).toContain('costoUnitarioCents');
    expect(lee('lib/inventario/devolucion.ts')).toContain('valorDeDevolucion');
  });
  it('la migración agrega los orígenes y las columnas sin pisar los existentes', () => {
    const m = lee('lib/db/migrations/0244_inventario_contable.sql');
    for (const o of ['costo_venta', 'ajuste_inventario', 'activo_compra']) expect(m).toContain(`'${o}'`);
    expect(m).toContain('pg_get_constraintdef');
    expect(m).toContain('ADD COLUMN IF NOT EXISTS costo_total_cents');
  });
});
