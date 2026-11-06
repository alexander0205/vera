/**
 * Registrar un activo a mano con «¿Cómo se pagó?» asienta la compra
 * (Debe cuenta del activo · Haber caja/banco) en la misma operación; sin pago no
 * asienta nada; si el asiento falla, la ficha no se queda. La base se simula por
 * el texto de cada consulta.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';

const dialect = new PgDialect();
let registro: { sql: string; params: unknown[] }[] = [];
let cuentaValida = true;

function ejecutar(q: never): unknown[] {
  const { sql, params } = dialect.sqlToQuery(q);
  const t = sql.trim().replace(/\s+/g, ' ');
  registro.push({ sql: t, params });
  if (t.includes('information_schema.columns')) return [{ '?column?': 1 }];
  if (t.includes('to_regclass')) return [{ existe: true }];
  if (t.startsWith('INSERT INTO contabilidad_activos_fijos')) return [{ id: 77 }];
  if (t.startsWith('SELECT id, imputable, activa FROM contabilidad_cuentas')) {
    return cuentaValida ? params.slice(1).map((id) => ({ id, imputable: true, activa: true })) : [];
  }
  if (t.startsWith('SELECT id FROM contabilidad_cuentas WHERE team_id')) return [{ id: 1201 }];
  if (t.includes("nextval('contabilidad_asiento_manual_seq')")) return [{ origen_id: 5 }];
  if (t.startsWith('INSERT INTO contabilidad_asientos')) return [{ id: 88 }];
  return [];
}

vi.mock('@/lib/db/drizzle', () => ({
  db: {
    execute: async (q: never) => ejecutar(q),
    transaction: async (fn: (tx: { execute: (q: never) => Promise<unknown> }) => Promise<unknown>) => fn({ execute: async (q: never) => ejecutar(q) }),
  },
}));
let contabilidadActiva = true;
vi.mock('@/lib/contabilidad/config', () => ({
  getConfig: async () => ({ activa: contabilidadActiva, cuentaActivoFijoId: null }),
}));
vi.mock('@/lib/contabilidad/catalogo-base', () => ({
  CODIGO: { activoFijo: '1201', gastoDepreciacion: '6103', depreciacionAcum: '1202' },
  asegurarCuentaBase: async (_t: number, codigo: string) => (codigo === '1207' ? 207 : 211),
}));

import { registrarActivoFijo, ActivoFijoError, repartirDepreciacionPrevia } from '@/lib/contabilidad/depreciacion';

const input = { nombre: 'Laptops', costoCents: 3_000_000, valorResidualCents: 0, vidaUtilMeses: 36, fechaAdquisicion: '2026-03-10', cantidad: 3, categoria: 'computo' };

beforeEach(() => { registro = []; cuentaValida = true; contabilidadActiva = true; });

describe('registrarActivoFijo con pago', () => {
  it('asienta Debe cuenta de la categoría / Haber la cuenta de pago', async () => {
    const id = await registrarActivoFijo(35, input, 1, { pago: { cuentaPagoId: 1566 } });
    expect(id).toBe(77);
    const lineas = registro.filter((r) => r.sql.startsWith('INSERT INTO contabilidad_asiento_lineas'));
    expect(lineas).toHaveLength(2);
    // (asiento, team, cuenta, debe, haber, descripcion, orden) en ese orden.
    expect(lineas[0].params.slice(2, 5)).toEqual([207, 3_000_000, 0]);
    expect(lineas[1].params.slice(2, 5)).toEqual([1566, 0, 3_000_000]);
  });

  it('sin pago no asienta nada', async () => {
    await registrarActivoFijo(35, input, 1);
    expect(registro.some((r) => r.sql.startsWith('INSERT INTO contabilidad_asientos'))).toBe(false);
  });

  it('el asiento sale con origen activo_compra y el id de la ficha (un reintento no lo duplica)', async () => {
    await registrarActivoFijo(35, input, 1, { pago: { cuentaPagoId: 1566 } });
    const ins = registro.find((r) => r.sql.startsWith('INSERT INTO contabilidad_asientos'))!;
    expect(ins.params).toContain('activo_compra');
    expect(ins.params).toContain(77);
    expect(registro.some((r) => r.sql.includes("nextval('contabilidad_asiento_manual_seq')"))).toBe(false);
  });

  it('si el asiento falla (cuenta no válida) todo va en la misma transacción: avisa y no hay DELETE manual', async () => {
    cuentaValida = false;
    await expect(registrarActivoFijo(35, input, 1, { pago: { cuentaPagoId: 9999 } })).rejects.toBeInstanceOf(ActivoFijoError);
    expect(registro.some((r) => r.sql.startsWith('DELETE FROM contabilidad_activos_fijos'))).toBe(false);
  });

  it('con la contabilidad apagada no asienta nada', async () => {
    contabilidadActiva = false;
    const id = await registrarActivoFijo(35, input, 1, { pago: { cuentaPagoId: 1566 } });
    expect(id).toBe(77);
    expect(registro.some((r) => r.sql.startsWith('INSERT INTO contabilidad_asientos'))).toBe(false);
  });

  it('la categoría «otros» y sin categoría van a la cuenta general 1201', async () => {
    await registrarActivoFijo(35, { ...input, categoria: 'otros' }, 1, { pago: { cuentaPagoId: 1566 } });
    const l = registro.filter((r) => r.sql.startsWith('INSERT INTO contabilidad_asiento_lineas'));
    expect(l[0].params[2]).toBe(1201);
  });

  it('la fecha de adquisición no puede ser futura', async () => {
    await expect(registrarActivoFijo(35, { ...input, fechaAdquisicion: '2999-01-01' }, 1)).rejects.toThrow(/futura/);
  });

  it('ya en libros: no asienta; guarda los meses vencidos sin asiento por lo que ya se depreció', async () => {
    const id = await registrarActivoFijo(35, { ...input, fechaAdquisicion: '2026-03-10' }, 1, { libros: { cuentaActivoId: null, deprecAcumCents: 500_000 } });
    expect(id).toBe(77);
    expect(registro.some((r) => r.sql.startsWith('INSERT INTO contabilidad_asientos'))).toBe(false);
    const filas = registro.filter((r) => r.sql.startsWith('INSERT INTO contabilidad_depreciaciones'));
    expect(filas.length).toBeGreaterThan(0);
    expect(filas.reduce((t, r) => t + Number(r.params[3]), 0)).toBe(500_000);
  });

  it('ya en libros con depreciación acumulada mayor que lo depreciable falla', async () => {
    await expect(registrarActivoFijo(35, input, 1, { libros: { cuentaActivoId: null, deprecAcumCents: 9_000_000 } })).rejects.toThrow(/depreciable/);
  });

  it('pago y libros a la vez no se aceptan', async () => {
    await expect(registrarActivoFijo(35, input, 1, { pago: { cuentaPagoId: 1566 }, libros: { cuentaActivoId: null, deprecAcumCents: 0 } })).rejects.toBeInstanceOf(ActivoFijoError);
  });

  it('una ficha de solo control no lleva asiento de compra', async () => {
    await expect(registrarActivoFijo(35, { ...input, soloControl: true }, 1, { pago: { cuentaPagoId: 1566 } })).rejects.toBeInstanceOf(ActivoFijoError);
  });
});

describe('repartirDepreciacionPrevia', () => {
  const meses = [{ periodo: '2026-04-01', montoCents: 100 }, { periodo: '2026-05-01', montoCents: 100 }, { periodo: '2026-06-01', montoCents: 100 }];
  it('suma exactamente lo indicado y el último absorbe los centavos', () => {
    const r = repartirDepreciacionPrevia(meses, 200);
    expect(r.reduce((t, c) => t + c.montoCents, 0)).toBe(200);
    expect(r.map((c) => c.periodo)).toEqual(meses.map((m) => m.periodo));
  });
  it('con cero deja todos los meses en cero', () => {
    expect(repartirDepreciacionPrevia(meses, 0).every((c) => c.montoCents === 0)).toBe(true);
  });
});
