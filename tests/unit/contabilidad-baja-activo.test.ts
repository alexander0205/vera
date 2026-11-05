/**
 * Dar de baja unidades de un activo: la baja, el asiento y el cierre de la
 * ficha salen en una sola transacción, el asiento cuadra y es un RETIRO (sin
 * precio de venta: vender lleva factura en Facturación). La base se simula por
 * el texto de cada consulta.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';

const dialect = new PgDialect();

const registro: { sql: string; params: unknown[] }[] = [];
let activo: Record<string, unknown>;
let bajasPrevias: { unidades: number; costo: number; deprec: number };
let acumulada: number;
let debitosCompra: { cuentaId: number; monto: string }[];
let itemCuentaId: number | null;

function ejecutar(q: never) {
  const { sql, params } = dialect.sqlToQuery(q);
  const t = sql.trim().replace(/\s+/g, ' ');
  registro.push({ sql: t, params });
  if (t.includes('FROM contabilidad_activos_fijos WHERE id =') && t.includes('FOR UPDATE')) return [activo];
  if (t.includes('FROM contabilidad_activos_bajas WHERE activo_id')) return [bajasPrevias];
  if (t.includes('FROM contabilidad_depreciaciones WHERE activo_id')) return [{ acumulada }];
  if (t.startsWith('SELECT id, imputable, activa FROM contabilidad_cuentas')) return params.slice(1).map((id) => ({ id, imputable: true, activa: true }));
  if (t.includes('FROM compras_locales_items')) return [{ cuentaId: itemCuentaId }];
  if (t.includes('FROM contabilidad_config_gastos')) return [];
  if (t.includes('GROUP BY l.cuenta_id')) return debitosCompra;
  if (t.startsWith('SELECT id FROM contabilidad_cuentas WHERE team_id')) return [{ id: 100 }];
  if (t.startsWith('INSERT INTO contabilidad_activos_bajas')) return [{ id: 77 }];
  if (t.includes("nextval('contabilidad_asiento_manual_seq')")) return [{ origen_id: 5 }];
  if (t.startsWith('INSERT INTO contabilidad_asientos')) return [{ id: 88 }];
  return [];
}

vi.mock('@/lib/db/drizzle', () => ({
  db: {
    execute: async (q: never) => ejecutar(q),
    transaction: async (fn: (tx: { execute: (q: never) => Promise<unknown> }) => Promise<unknown>) =>
      fn({ execute: async (q: never) => ejecutar(q) }),
  },
}));
vi.mock('@/lib/contabilidad/config', () => ({
  getConfig: async () => ({ cuentaActivoFijoId: 100, cuentaDeprecAcumId: 200 }),
  cuentasDeSalida: async () => ({ cuentas: [], porMetodo: {} }),
}));
vi.mock('@/lib/contabilidad/catalogo-base', () => ({
  CODIGO: { gananciaActivos: '4105', perdidaActivos: '6120', activoFijo: '1201', depreciacionAcum: '1202' },
  asegurarCuentaBaseDetalle: async (_t: number, codigo: string) => ({ id: codigo === '4105' ? 400 : 500, codigo, aviso: codigo === '6120' ? 'aviso de cuenta alterna' : null }),
}));
vi.mock('@/lib/contabilidad/depreciacion', () => ({
  activosCompletosDisponible: async () => true,
  generarDepreciacionesPendientes: async () => ({ creados: 0, activosProcesados: 0 }),
  registrarActivoFijo: async () => 0,
  ActivoFijoError: class extends Error {},
}));

import { darDeBajaActivo } from '@/lib/contabilidad/activos-fijos-db';
import { BajaActivoError } from '@/lib/contabilidad/activos-fijos';

const base = { teamId: 1, userId: 9, activoId: 10, fecha: '2026-01-10' };

beforeEach(() => {
  registro.length = 0;
  // 30 butacas de RD$300,000, con RD$90,000 depreciados.
  activo = { id: 10, nombre: 'Butacas', costo: '30000000', cantidad: 30, activa: true, enRevision: false, adquirido: '2025-01-01', compraId: null, compraLinea: null, cuentaActivoId: null, cuentaDeprecId: null };
  bajasPrevias = { unidades: 0, costo: 0, deprec: 0 };
  acumulada = 9_000_000;
  debitosCompra = [];
  itemCuentaId = null;
});

const lineasDelAsiento = () => registro
  .filter((r) => r.sql.startsWith('INSERT INTO contabilidad_asiento_lineas'))
  .map((r) => ({ cuentaId: Number(r.params[2]), debe: Number(r.params[3]), haber: Number(r.params[4]) }));

describe('darDeBajaActivo', () => {
  it('una butaca retirada: pérdida por lo que valía y el asiento cuadra', async () => {
    const r = await darDeBajaActivo({ ...base, unidades: 1 });
    expect(r).toMatchObject({ bajaId: 77, asientoId: 88, unidadesRestantes: 29 });
    expect(r.calculo).toMatchObject({ costoBajaCents: 1_000_000, depreciacionBajaCents: 300_000, resultadoCents: -700_000, precioVentaCents: 0 });
    const l = lineasDelAsiento();
    expect(l.reduce((s, x) => s + x.debe, 0)).toBe(l.reduce((s, x) => s + x.haber, 0));
    expect(l.find((x) => x.cuentaId === 100)?.haber).toBe(1_000_000);
    expect(l.find((x) => x.cuentaId === 200)?.debe).toBe(300_000);
    expect(l.find((x) => x.cuentaId === 500)?.debe).toBe(700_000);
    expect(registro.some((x) => x.sql.includes('SET activa = false'))).toBe(false);
  });

  it('nunca registra venta: ni cuenta de cobro ni ganancia, aunque el valor en libros sea cero', async () => {
    acumulada = 30_000_000;
    await darDeBajaActivo({ ...base, unidades: 30 });
    const l = lineasDelAsiento();
    expect(l.some((x) => x.cuentaId === 400)).toBe(false);
    expect(registro.find((r) => r.sql.startsWith('INSERT INTO contabilidad_activos_bajas'))!.sql).toContain('0, ');
  });

  it('avisa cuando la cuenta de pérdida es alterna (el catálogo usa su código para otra cosa)', async () => {
    const r = await darDeBajaActivo({ ...base, unidades: 1 });
    expect(r.avisos).toEqual(['aviso de cuenta alterna']);
  });

  it('usa las cuentas propias de la ficha cuando las tiene', async () => {
    activo = { ...activo, cuentaActivoId: 111, cuentaDeprecId: 222 };
    await darDeBajaActivo({ ...base, unidades: 1 });
    const l = lineasDelAsiento();
    expect(l.find((x) => x.cuentaId === 111)?.haber).toBe(1_000_000);
    expect(l.find((x) => x.cuentaId === 222)?.debe).toBe(300_000);
  });

  it('una ficha de compra saca el costo de la cuenta REAL a la que la compra lo llevó', async () => {
    activo = { ...activo, compraId: 55, compraLinea: 0 };
    itemCuentaId = 777;
    debitosCompra = [{ cuentaId: 777, monto: '30000000' }];
    await darDeBajaActivo({ ...base, unidades: 1 });
    expect(lineasDelAsiento().find((x) => x.cuentaId === 777)?.haber).toBe(1_000_000);
  });

  it('descuenta lo ya dado de baja antes y cierra la ficha al retirar lo último', async () => {
    bajasPrevias = { unidades: 10, costo: 10_000_000, deprec: 3_000_000 };
    const r = await darDeBajaActivo({ ...base, unidades: 20 });
    expect(r.calculo).toMatchObject({ esTotal: true, costoBajaCents: 20_000_000, depreciacionBajaCents: 6_000_000 });
    expect(r.unidadesRestantes).toBe(0);
    expect(registro.some((x) => x.sql.includes('SET activa = false'))).toBe(true);
  });

  it('rechaza una ficha sin confirmar, ya dada de baja, una fecha anterior a la compra o futura', async () => {
    activo = { ...activo, enRevision: true };
    await expect(darDeBajaActivo({ ...base, unidades: 1 })).rejects.toThrow(/Confirma primero/);
    activo = { ...activo, enRevision: false, activa: false };
    await expect(darDeBajaActivo({ ...base, unidades: 1 })).rejects.toThrow(/ya está dado de baja/);
    activo = { ...activo, activa: true };
    await expect(darDeBajaActivo({ ...base, fecha: '2024-12-31', unidades: 1 })).rejects.toThrow(/anterior a la compra/);
    await expect(darDeBajaActivo({ ...base, fecha: '2099-01-01', unidades: 1 })).rejects.toThrow(/futura/);
    expect(registro.some((x) => x.sql.startsWith('INSERT INTO contabilidad_asientos'))).toBe(false);
  });

  it('no deja dar de baja más unidades de las que quedan', async () => {
    bajasPrevias = { unidades: 29, costo: 29_000_000, deprec: 8_700_000 };
    await expect(darDeBajaActivo({ ...base, unidades: 2 })).rejects.toBeInstanceOf(BajaActivoError);
  });
});
