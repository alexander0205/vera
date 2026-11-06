/**
 * Las fichas de «solo control de inventario» se cuentan en unidades pero NO se
 * deprecian: el generador no les crea cuotas ni asientos. La base se simula por el
 * texto de cada consulta.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';

const dialect = new PgDialect();
const registro: { sql: string; params: unknown[] }[] = [];
let fichas: Record<string, unknown>[] = [];
let hayColumna = true;

function ejecutar(q: never): unknown[] {
  const { sql, params } = dialect.sqlToQuery(q);
  const t = sql.trim().replace(/\s+/g, ' ');
  registro.push({ sql: t, params });
  if (t.includes('information_schema.columns') && t.includes("column_name = 'cantidad'")) return [{ '?column?': 1 }];
  if (t.includes('information_schema.columns') && t.includes("column_name = 'solo_control'")) return hayColumna ? [{ '?column?': 1 }] : [];
  if (t.includes("to_regclass('public.contabilidad_activos_bajas')")) return [{ existe: true }];
  if (t.startsWith('SELECT id FROM contabilidad_cuentas')) return [{ id: 100 }];
  if (t.includes('FROM contabilidad_activos_fijos') && t.includes('ORDER BY id')) return fichas;
  if (t.includes('FROM contabilidad_activos_bajas')) return [];
  if (t.includes('FROM contabilidad_depreciaciones')) return [];
  if (t.startsWith('INSERT INTO contabilidad_depreciaciones')) return [{ id: registro.length }];
  if (t.startsWith('INSERT INTO contabilidad_asientos')) return [{ id: 900 + registro.length }];
  return [];
}

vi.mock('@/lib/db/drizzle', () => ({
  db: {
    execute: async (q: never) => ejecutar(q),
    transaction: async (fn: (tx: { execute: (q: never) => Promise<unknown> }) => Promise<unknown>) =>
      fn({ execute: async (q: never) => ejecutar(q) }),
  },
}));
vi.mock('@/lib/contabilidad/config', () => ({ getConfig: async () => ({ activa: true, cuentaGastoDeprecId: 6103, cuentaDeprecAcumId: 1202 }) }));
vi.mock('@/lib/contabilidad/catalogo-base', () => ({
  CODIGO: { gastoDepreciacion: '6103', depreciacionAcum: '1202' },
  asegurarCuentaBase: async () => 1,
}));
vi.mock('@/lib/utils/format', () => ({ hoyRD: () => '2026-06-15' }));

import { activoSeDeprecia, generarDepreciacionesPendientes } from '@/lib/contabilidad/depreciacion';

const base = { costoCents: 1_200_000, valorResidualCents: 0, vidaUtilMeses: 12, fechaAdquisicion: '2026-01-10', cantidad: 1, cuentaDeprecAcumId: null, cuentaGastoDeprecId: null };

beforeEach(() => {
  registro.length = 0;
  hayColumna = true;
  fichas = [
    { id: 1, nombre: 'Equipo normal', ...base, soloControl: false },
    { id: 2, nombre: 'Marcadores', ...base, soloControl: true },
  ];
});

describe('solo control no deprecia', () => {
  it('la regla pura: solo control, terrenos, sin confirmar y dadas de baja no generan cuotas', () => {
    expect(activoSeDeprecia({ soloControl: false })).toBe(true);
    expect(activoSeDeprecia({ soloControl: true })).toBe(false);
    expect(activoSeDeprecia({ enRevision: true })).toBe(false);
    expect(activoSeDeprecia({ categoria: 'terrenos' })).toBe(false);
    expect(activoSeDeprecia({ activa: false })).toBe(false);
    expect(activoSeDeprecia({ categoria: 'mobiliario', soloControl: false, enRevision: false, activa: true })).toBe(true);
  });

  it('el generador filtra en la consulta por solo_control', async () => {
    await generarDepreciacionesPendientes(1, 9);
    const consulta = registro.find((r) => r.sql.includes('FROM contabilidad_activos_fijos') && r.sql.includes('ORDER BY id'));
    expect(consulta?.sql).toContain('AND NOT solo_control');
  });

  it('y aunque la consulta lo devolviera, no se le crea cuota ni asiento a una ficha de solo control', async () => {
    const r = await generarDepreciacionesPendientes(1, 9);
    expect(r.activosProcesados).toBe(1);
    const cuotas = registro.filter((x) => x.sql.startsWith('INSERT INTO contabilidad_depreciaciones'));
    expect(cuotas.length).toBeGreaterThan(0);
    // Todas son del activo 1 (params: team, activo, periodo, monto).
    for (const c of cuotas) expect(c.params[1]).toBe(1);
    expect(cuotas.some((c) => c.params[1] === 2)).toBe(false);
    expect(r.creados).toBe(cuotas.length);
  });

  it('antes de la migración (sin columna) todo sigue como antes y la consulta no menciona solo_control', async () => {
    hayColumna = false;
    fichas = [{ id: 1, nombre: 'Equipo normal', ...base }];
    // El «sí» de la columna se recuerda por módulo: se carga uno limpio.
    vi.resetModules();
    const limpio = await import('@/lib/contabilidad/depreciacion');
    const r = await limpio.generarDepreciacionesPendientes(1, 9);
    expect(r.activosProcesados).toBe(1);
    const consulta = registro.find((x) => x.sql.includes('FROM contabilidad_activos_fijos') && x.sql.includes('ORDER BY id'));
    expect(consulta?.sql).not.toContain('solo_control');
  });
});
