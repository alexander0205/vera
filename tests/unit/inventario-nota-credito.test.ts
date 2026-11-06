/**
 * Notas frente al inventario: nunca descuentan; la de crédito con «el cliente
 * devolvió la mercancía» sube el stock y revierte el costo de la venta original.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'node:fs';

const capturado: { sql: string; params: unknown[] }[] = [];
const filasProductos: { id: number; stockActual: number; controlaInventario: boolean; costo: number }[] = [];
const movimientosInsertados: Record<string, unknown>[][] = [];
let previas: Record<string, unknown>[] = [];
let devolucionExistente = false;

function texto(frag: unknown): { sql: string; params: unknown[] } {
  const chunks = ((frag as { queryChunks?: unknown[] }).queryChunks ?? []);
  const esTexto = (c: unknown): c is { value: string[] } =>
    typeof c === 'object' && c !== null && Array.isArray((c as { value?: unknown }).value);
  return { sql: chunks.filter(esTexto).map((c) => c.value.join('')).join(' '), params: chunks.filter((c) => !esTexto(c)) };
}

vi.mock('@/lib/db/drizzle', () => {
  const enc = { from: () => enc, where: () => enc, orderBy: () => enc, limit: () => Promise.resolve([{ almacenId: null }]), for: () => Promise.resolve(filasProductos) };
  const tx = {
    select: () => enc,
    execute: (frag: unknown) => {
      const t = texto(frag); capturado.push(t);
      if (/FROM inventory_movements/.test(t.sql) && /SELECT/i.test(t.sql)) return Promise.resolve(previas);
      return Promise.resolve([]);
    },
    insert: () => ({ values: (v: Record<string, unknown>[]) => { movimientosInsertados.push(v); return Promise.resolve(); } }),
    update: () => ({ set: () => ({ where: () => Promise.resolve() }) }),
  };
  return {
    db: {
      select: () => enc,
      execute: (frag: unknown) => { capturado.push(texto(frag)); return Promise.resolve(devolucionExistente ? [{ ok: 1 }] : []); },
      transaction: (fn: (t: typeof tx) => Promise<void>) => fn(tx),
    },
  };
});

import { movimientoDeStock, devolverMercanciaDeNota } from '@/lib/inventario/nota-credito';

beforeEach(() => {
  capturado.length = 0; filasProductos.length = 0; movimientosInsertados.length = 0; previas = []; devolucionExistente = false;
});

describe('qué le hace una nota al stock', () => {
  it('las facturas descuentan; las notas NUNCA', () => {
    for (const t of ['31', '32', '44', '45', 'sin-ncf']) expect(movimientoDeStock(t, false)).toBe('descontar');
    expect(movimientoDeStock('33', false)).toBe('ninguno');
    expect(movimientoDeStock('33', true)).toBe('ninguno');       // la nota de débito jamás mueve
    expect(movimientoDeStock('34', false)).toBe('ninguno');      // sin devolución: ni stock ni costo
    expect(movimientoDeStock('34', undefined)).toBe('ninguno');
    expect(movimientoDeStock('34', true)).toBe('devolver');
  });
});

describe('devolver la mercancía de una nota de crédito', () => {
  const item = { productoId: 7, cantidadItem: 3, indicadorBienoServicio: 1 as const };

  it('sube el stock y revierte EXACTAMENTE el costo con que salió la venta original', async () => {
    filasProductos.push({ id: 7, stockActual: 10, controlaInventario: true, costo: 500 /* costo de hoy: no debe usarse */ });
    previas = [{ productoId: 7, variantId: null, tipo: 'VENTA', cantidad: 3, costoTotalCents: 999 }];
    const r = await devolverMercanciaDeNota({ teamId: 1, userId: 2, notaId: 90, notaEncf: 'E340000000001', padreId: 70, items: [item] });
    expect(r.devuelto).toBe(true);
    const m = movimientosInsertados[0][0];
    expect(m).toMatchObject({ tipo: 'DEVOLUCION', esEntrada: true, cantidad: 3, stockAntes: 10, stockDespues: 13, costoTotalCents: 999, costoUnitarioCents: 333 });
    // Queda ligado a la factura original y lleva el e-NCF de la nota.
    expect(m).toMatchObject({ referenciaId: 70, referenciaEncf: 'E340000000001' });
  });

  it('una devolución parcial usa el costo promedio de lo vendido, no el de hoy', async () => {
    filasProductos.push({ id: 7, stockActual: 0, controlaInventario: true, costo: 9999 });
    previas = [{ productoId: 7, variantId: null, tipo: 'VENTA', cantidad: 10, costoTotalCents: 5000 }];
    await devolverMercanciaDeNota({ teamId: 1, userId: 2, notaId: 90, notaEncf: 'E340000000002', padreId: 70, items: [{ ...item, cantidadItem: 4 }] });
    expect(movimientosInsertados[0][0]).toMatchObject({ costoTotalCents: 2000 });
  });

  it('es idempotente: la misma nota dos veces no devuelve dos veces', async () => {
    filasProductos.push({ id: 7, stockActual: 10, controlaInventario: true, costo: 500 });
    previas = [{ productoId: 7, variantId: null, tipo: 'VENTA', cantidad: 3, costoTotalCents: 999 }];
    devolucionExistente = true;
    const r = await devolverMercanciaDeNota({ teamId: 1, userId: 2, notaId: 90, notaEncf: 'E340000000001', padreId: 70, items: [item] });
    expect(r.devuelto).toBe(false);
    expect(movimientosInsertados).toHaveLength(0);
  });

  it('si la venta original no se valoró (anterior a la migración), el stock vuelve pero no hay costo que revertir', async () => {
    filasProductos.push({ id: 7, stockActual: 10, controlaInventario: true, costo: 500 });
    previas = [{ productoId: 7, variantId: null, tipo: 'VENTA', cantidad: 3, costoTotalCents: null }];
    await devolverMercanciaDeNota({ teamId: 1, userId: 2, notaId: 90, notaEncf: 'E340000000003', padreId: 70, items: [item] });
    expect(movimientosInsertados[0][0]).toMatchObject({ stockDespues: 13, costoTotalCents: null, costoUnitarioCents: null });
  });

  it('sin factura original en el sistema se refiere a la propia nota', async () => {
    filasProductos.push({ id: 7, stockActual: 1, controlaInventario: true, costo: 500 });
    await devolverMercanciaDeNota({ teamId: 1, userId: 2, notaId: 90, notaEncf: 'E340000000004', padreId: null, items: [item] });
    expect(movimientosInsertados[0][0]).toMatchObject({ referenciaId: 90, costoTotalCents: null });
  });
});

describe('las rutas de emisión respetan la regla', () => {
  const lee = (p: string) => fs.readFileSync(p, 'utf8');
  it('ninguna ruta llama a descontarInventario sin pasar por la decisión de stock', () => {
    const emitir = lee('app/api/ecf/emitir/route.ts');
    expect(emitir).toContain("movimientoDeStock(data.tipoEcf, data.devuelveMercancia)");
    expect(emitir).toContain("devolverMercanciaDeNota");
    const ecf = lee('app/api/facturas/[id]/emitir-ecf/route.ts');
    expect(ecf).toContain('movimientoDeStock(tipoEcf, doc.devuelveMercancia)');
    expect(ecf).toContain('devolverMercanciaDeNota');
  });
  it('una nota no queda marcada como «stock descontado» (así anularla no repone stock de más)', () => {
    expect(lee('app/api/ecf/emitir/route.ts')).toContain("stockDescontado:      movimientoDeStock(data.tipoEcf, data.devuelveMercancia) === 'descontar'");
  });
  it('el formulario de la nota de crédito pregunta si el cliente devolvió la mercancía', () => {
    expect(lee('app/(dashboard)/dashboard/facturas/nueva/NuevaFacturaForm.tsx')).toContain('¿El cliente devolvió la mercancía?');
  });
});

describe('compras (41) y gastos (43/47)', () => {
  it('nunca descuentan stock; las ventas fiscales 44, 45 y 46 siguen descontando', () => {
    for (const t of ['41', '43', '47']) {
      expect(movimientoDeStock(t, false)).toBe('ninguno');
      expect(movimientoDeStock(t, true)).toBe('ninguno');
    }
    for (const t of ['31', '32', '44', '45', '46', 'sin-ncf']) expect(movimientoDeStock(t, false)).toBe('descontar');
  });
  it('un documento 41 no queda marcado como «stock descontado» (anularlo no repone stock)', () => {
    expect(movimientoDeStock('41', undefined) === 'descontar').toBe(false);
  });
  it('la compra (41) sube el stock UNA vez, por el camino de Compras (registrarEntradas), no por la emisión', () => {
    const lee = (p: string) => fs.readFileSync(p, 'utf8');
    const compras = lee('lib/compras/registrar.ts');
    expect(compras.match(/await registrarEntradas\(/g)).toHaveLength(1);
    // La emisión de e-CF no llama a registrarEntradas: si lo hiciera, la compra entraría dos veces.
    expect(lee('app/api/ecf/emitir/route.ts')).not.toContain('registrarEntradas');
    expect(lee('app/api/facturas/[id]/emitir-ecf/route.ts')).not.toContain('registrarEntradas');
  });
});
