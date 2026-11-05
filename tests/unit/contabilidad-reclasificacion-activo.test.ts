/**
 * La cuenta de activo de una ficha es donde de verdad está su costo. Cambiar la
 * categoría de una ficha sin historia reclasifica con asiento (siempre, también
 * ya confirmada); sin asiento de compra todavía no se mueve nada; con historia
 * se bloquea. La base se simula por el texto de cada consulta.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';

const dialect = new PgDialect();
const registro: { sql: string; params: unknown[] }[] = [];
let ficha: Record<string, unknown>;
let historia = 0;
let itemCuentaId: number | null = null;
let debitos: { cuentaId: number; monto: string }[] = [];
let activa = true;
let filaYaCambiada = false;

function ejecutar(q: never): unknown[] {
  const { sql, params } = dialect.sqlToQuery(q);
  const t = sql.trim().replace(/\s+/g, ' ');
  registro.push({ sql: t, params });
  if (t.includes('to_regclass')) return [{ existe: true }];
  if (t.includes('FROM contabilidad_activos_fijos WHERE id =')) return [ficha];
  if (t.includes('AS historia')) return [{ historia }];
  if (t.includes('FROM compras_locales_items')) return [{ cuentaId: itemCuentaId }];
  if (t.includes('FROM contabilidad_config_gastos')) return [];
  if (t.includes('GROUP BY l.cuenta_id')) return debitos;
  if (t.startsWith('SELECT id FROM contabilidad_cuentas WHERE team_id')) return [{ id: 100 }];
  if (t.startsWith('SELECT id, tipo, imputable, activa, codigo')) return [{ id: params[1] === '1204' ? 204 : 208, tipo: 'activo', imputable: true, activa: true, codigo: String(params[1]), esBase: true }];
  if (t.startsWith('SELECT id, imputable, activa FROM contabilidad_cuentas')) return params.slice(1).map((id) => ({ id, imputable: true, activa: true }));
  if (t.includes("nextval('contabilidad_asiento_manual_seq')")) return [{ origen_id: 5 }];
  if (t.startsWith('INSERT INTO contabilidad_asientos')) return [{ id: 88 }];
  if (t.includes('UPDATE contabilidad_activos_fijos SET')) {
    // Como Postgres: la segunda edición, sobre la misma lectura, vuelve a evaluar el WHERE y ya no encuentra la fila.
    if (t.includes('IS NOT DISTINCT FROM') && filaYaCambiada) return [];
    filaYaCambiada = true;
    return [{ id: 10 }];
  }
  return [];
}

vi.mock('@/lib/db/drizzle', () => ({
  db: {
    execute: async (q: never) => ejecutar(q),
    transaction: async (fn: (tx: { execute: (q: never) => Promise<unknown> }) => Promise<unknown>) => fn({ execute: async (q: never) => ejecutar(q) }),
  },
}));
vi.mock('@/lib/contabilidad/depreciacion', () => ({
  activosCompletosDisponible: async () => true,
  generarDepreciacionesPendientes: async () => ({}),
  registrarActivoFijo: async () => 0,
  ActivoFijoError: class ActivoFijoError extends Error {},
}));
vi.mock('@/lib/contabilidad/config', () => ({ getConfig: async () => ({ cuentaActivoFijoId: 100, activa }), cuentasDeSalida: async () => ({ cuentas: [], porMetodo: {} }) }));

import { editarActivoFijo } from '@/lib/contabilidad/activos-fijos-db';

const reclases = () => registro.filter((r) => r.sql.startsWith('INSERT INTO contabilidad_asiento_lineas'))
  .map((r) => ({ cuentaId: Number(r.params[2]), debe: Number(r.params[3]), haber: Number(r.params[4]) }));

beforeEach(() => {
  registro.length = 0; historia = 0; itemCuentaId = null; debitos = []; activa = true; filaYaCambiada = false;
  ficha = { id: 10, costo: '500000', enRevision: false, categoria: null, compraId: null, compraLinea: null, cuentaActivoId: null, adquirido: '2026-01-05' };
});

describe('editarActivoFijo: reclasificación con asiento', () => {
  it('una ficha ya confirmada que cambia de categoría pasa su costo de la cuenta general a la nueva, con asiento', async () => {
    await editarActivoFijo(1, 9, 10, { categoria: 'edificios' });
    const l = reclases();
    expect(l).toEqual([{ cuentaId: 204, debe: 500000, haber: 0 }, { cuentaId: 100, debe: 0, haber: 500000 }]);
  });

  it('hecho en dos llamadas (categoría y luego confirmar) también reclasifica, una sola vez', async () => {
    ficha = { ...ficha, enRevision: true };
    await editarActivoFijo(1, 9, 10, { categoria: 'edificios' });
    expect(reclases()).toHaveLength(2);
    registro.length = 0; filaYaCambiada = false;
    ficha = { ...ficha, enRevision: true, categoria: 'edificios', cuentaActivoId: 204 };
    await editarActivoFijo(1, 9, 10, { confirmar: true });
    expect(reclases()).toEqual([]);
  });

  it('una ficha de compra cuyo costo fue a una cuenta elegida a mano reclasifica DESDE esa cuenta, no desde 1201', async () => {
    ficha = { ...ficha, compraId: 55, compraLinea: 0, enRevision: true };
    itemCuentaId = 777;
    debitos = [{ cuentaId: 777, monto: '500000' }];
    await editarActivoFijo(1, 9, 10, { categoria: 'edificios', confirmar: true });
    const l = reclases();
    expect(l.find((x) => x.haber > 0)?.cuentaId).toBe(777);
    expect(l.find((x) => x.debe > 0)?.cuentaId).toBe(204);
  });

  it('una ficha de compra cuyo asiento todavía no existe no mueve nada y no guarda cuenta', async () => {
    ficha = { ...ficha, compraId: 55, compraLinea: 0, enRevision: true };
    await editarActivoFijo(1, 9, 10, { categoria: 'edificios', confirmar: true });
    expect(reclases()).toEqual([]);
    const upd = registro.find((r) => r.sql.includes('UPDATE contabilidad_activos_fijos SET'))!;
    expect(upd.sql).toContain('cuenta_activo_id =');
    expect(upd.params).not.toContain(204);
  });

  it('quitar la categoría devuelve el costo a la cuenta general con otro asiento', async () => {
    ficha = { ...ficha, categoria: 'edificios', cuentaActivoId: 204 };
    await editarActivoFijo(1, 9, 10, { categoria: null });
    expect(reclases()).toEqual([{ cuentaId: 100, debe: 500000, haber: 0 }, { cuentaId: 204, debe: 0, haber: 500000 }]);
  });

  it('con cuotas o bajas se bloquea y no escribe nada', async () => {
    historia = 1;
    await expect(editarActivoFijo(1, 9, 10, { categoria: 'edificios' })).rejects.toThrow(/ya tiene depreciación o bajas/);
    expect(reclases()).toEqual([]);
    expect(registro.some((r) => r.sql.includes('UPDATE contabilidad_activos_fijos SET'))).toBe(false);
  });

  it('dos ediciones a la vez sobre la misma lectura dejan UN solo asiento de reclasificación', async () => {
    const resultados = await Promise.allSettled([
      editarActivoFijo(1, 9, 10, { categoria: 'edificios' }),
      editarActivoFijo(1, 9, 10, { categoria: 'edificios' }),
    ]);
    expect(resultados.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const rechazada = resultados.find((r) => r.status === 'rejected') as PromiseRejectedResult;
    expect(String(rechazada.reason.message)).toMatch(/mientras tanto/);
    expect(registro.filter((r) => r.sql.startsWith('INSERT INTO contabilidad_asientos'))).toHaveLength(1);
    expect(reclases()).toHaveLength(2);
  });

  it('con la contabilidad apagada cambiar la categoría solo cambia la ficha: no asienta nada', async () => {
    activa = false;
    await editarActivoFijo(1, 9, 10, { categoria: 'edificios' });
    expect(registro.some((r) => r.sql.includes('UPDATE contabilidad_activos_fijos SET'))).toBe(true);
    expect(registro.some((r) => r.sql.startsWith('INSERT INTO contabilidad_asientos'))).toBe(false);
  });
});
