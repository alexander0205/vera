/**
 * Mover unidades de un aula a otra: si se mueven todas cambia el aula de la ficha;
 * si se mueve una parte la ficha se divide y NO nace ningún asiento. La base se
 * simula por el texto de cada consulta.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';

const dialect = new PgDialect();
const registro: { sql: string; params: unknown[] }[] = [];
let ficha: Record<string, unknown>;
let cuotas: { id: number; periodo: string; monto: string; asientoId: number }[];
let bajas: { unidades: number; costo: number; deprec: number };

function ejecutar(q: never): unknown[] {
  const { sql, params } = dialect.sqlToQuery(q);
  const t = sql.trim().replace(/\s+/g, ' ');
  registro.push({ sql: t, params });
  if (t.includes('information_schema.columns')) return [{ n: 4 }];
  if (t.includes('to_regclass')) return [{ ok: true }];
  if (t.includes('FROM contabilidad_activos_fijos WHERE id =') && t.includes('FOR UPDATE')) return [ficha];
  if (t.includes('FROM escolar_espacios WHERE id =')) return [{ id: 2 }];
  if (t.includes('FROM contabilidad_activos_bajas WHERE activo_id')) return [bajas];
  if (t.includes('sum(monto_cents)')) return [{ acumulada: cuotas.reduce((s, c) => s + Number(c.monto), 0) }];
  if (t.includes('FROM contabilidad_depreciaciones WHERE activo_id') && t.includes('FOR UPDATE')) return cuotas;
  if (t.startsWith('INSERT INTO contabilidad_activos_fijos')) return [{ id: 55 }];
  return [];
}

vi.mock('@/lib/db/drizzle', () => ({
  db: {
    execute: async (q: never) => ejecutar(q),
    transaction: async (fn: (tx: { execute: (q: never) => Promise<unknown> }) => Promise<unknown>) =>
      fn({ execute: async (q: never) => ejecutar(q) }),
  },
}));
vi.mock('@/lib/utils/format', () => ({ hoyRD: () => '2026-06-15' }));
vi.mock('@/lib/contabilidad/depreciacion', () => ({
  generarDepreciacionesPendientes: async () => ({ creados: 0, activosProcesados: 0 }),
  listarActivosFijos: async () => [],
  registrarActivoFijo: async () => 0,
}));

import { PlantaError, trasladarUnidades } from '@/lib/escolar/inventario-aula-db';

const base = { teamId: 1, userId: 9, activoId: 10, espacioDestinoId: 2 };

beforeEach(() => {
  registro.length = 0;
  ficha = {
    id: 10, nombre: 'Butacas', costo: '3000000', residual: '300000', vida: 60, adquirido: '2025-01-01', activa: true, cantidad: 30,
    ubicacion: null, categoria: 'mobiliario', cuentaActivoId: null, cuentaDeprecId: null, cuentaGastoId: null,
    enRevision: false, compraId: null, compraLinea: null, espacioId: 1, estado: 'bien', soloControl: false,
  };
  cuotas = [
    { id: 1, periodo: '2025-02-01', monto: '45000', asientoId: 71 },
    { id: 2, periodo: '2025-03-01', monto: '45000', asientoId: 72 },
    { id: 3, periodo: '2025-04-01', monto: '45001', asientoId: 73 },
  ];
  bajas = { unidades: 0, costo: 0, deprec: 0 };
});

const de = (prefijo: string) => registro.filter((r) => r.sql.startsWith(prefijo));

describe('trasladar unidades', () => {
  it('moviendo todas, solo cambia el aula de la ficha y queda el historial', async () => {
    const r = await trasladarUnidades({ ...base, unidades: 30 });
    expect(r).toEqual({ dividida: false, nuevoActivoId: null });
    expect(de('UPDATE contabilidad_activos_fijos SET espacio_id')).toHaveLength(1);
    expect(de('INSERT INTO contabilidad_activos_fijos')).toHaveLength(0);
    expect(de('INSERT INTO escolar_activo_traslados')).toHaveLength(1);
  });

  it('moviendo una parte, divide la ficha, reparte cada cuota y no crea asientos', async () => {
    const r = await trasladarUnidades({ ...base, unidades: 10 });
    expect(r).toEqual({ dividida: true, nuevoActivoId: 55 });

    // Ningún asiento ni cuota nueva: el libro queda como estaba.
    expect(registro.some((x) => x.sql.includes('contabilidad_asientos'))).toBe(false);

    // Costo y residual: la madre conserva dos terceras partes, la hija una.
    const hija = de('INSERT INTO contabilidad_activos_fijos')[0];
    const madre = de('UPDATE contabilidad_activos_fijos SET costo_cents')[0];
    expect(madre.params.slice(0, 3)).toEqual([2_000_000, 200_000, 20]);
    expect(hija.params).toContain(1_000_000);
    expect(hija.params).toContain(100_000);

    // Cada cuota: lo que se queda la madre + lo que recibe la hija = lo original, con el mismo asiento.
    const quedan = de('UPDATE contabilidad_depreciaciones SET monto_cents').map((x) => Number(x.params[0]));
    const nuevas = de('INSERT INTO contabilidad_depreciaciones');
    expect(quedan).toHaveLength(3);
    expect(nuevas).toHaveLength(3);
    nuevas.forEach((n, i) => {
      expect(quedan[i] + Number(n.params[3])).toBe(Number(cuotas[i].monto));
      expect(n.params[4]).toBe(cuotas[i].asientoId);
    });
    expect(quedan.reduce((s, x) => s + x, 0) + nuevas.reduce((s, n) => s + Number(n.params[3]), 0)).toBe(135_001);

    const hist = de('INSERT INTO escolar_activo_traslados')[0];
    expect(hist.params).toContain(10);
  });

  it('no mueve a la misma aula ni más de lo que hay', async () => {
    await expect(trasladarUnidades({ ...base, espacioDestinoId: 1, unidades: 5 })).rejects.toBeInstanceOf(PlantaError);
    await expect(trasladarUnidades({ ...base, unidades: 31 })).rejects.toBeInstanceOf(PlantaError);
  });

  it('una parte de una ficha con bajas, o sin confirmar, no se divide', async () => {
    bajas = { unidades: 2, costo: 100_000, deprec: 10_000 };
    await expect(trasladarUnidades({ ...base, unidades: 5 })).rejects.toThrow(/dadas de baja/);
    bajas = { unidades: 0, costo: 0, deprec: 0 };
    ficha = { ...ficha, enRevision: true };
    await expect(trasladarUnidades({ ...base, unidades: 5 })).rejects.toThrow(/Confirma primero/);
  });
});
