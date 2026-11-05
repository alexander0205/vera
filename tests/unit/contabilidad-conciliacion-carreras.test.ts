/**
 * C · Un apunte del libro queda ligado a UNA sola línea del banco (índice único
 * en 0224, y la violación se atrapa), y desemparejar devuelve el apunte a como
 * estaba (una marca manual previa se conserva). La base se simula por el texto
 * de cada consulta.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';
import { readFileSync } from 'node:fs';

const dialect = new PgDialect();
const sentencias: string[] = [];
let marcaPrevia = false;
let violarEn: string | null = null;

function ejecutar(q: never): unknown[] {
  const t = dialect.sqlToQuery(q).sql.trim().replace(/\s+/g, ' ');
  sentencias.push(t);
  if (violarEn && t.includes(violarEn)) throw Object.assign(new Error('duplicate key'), { code: '23505' });
  if (t.includes('to_regclass')) return [{ existe: true }];
  if (t.includes("estado = 'pendiente'") && t.startsWith('SELECT id, to_char')) return [{ id: 1, fecha: '2026-11-03', monto: '100', referencia: null, descripcion: null }];
  if (t.includes('a.fecha >=')) return [{ id: 50, fecha: '2026-11-03', monto: '100', texto: '' }];
  if (t.startsWith('SELECT cuenta_id AS "cuentaId", monto_cents AS monto, estado')) return [{ cuentaId: 7, monto: '100', estado: 'pendiente', referencia: null }];
  if (t.startsWith('SELECT (debe_cents - haber_cents) AS monto FROM contabilidad_asiento_lineas')) return [{ monto: '100' }];
  if (t.startsWith('INSERT INTO contabilidad_conciliaciones')) return [{ id: 1 }];
  if (t.startsWith("UPDATE contabilidad_extracto_lineas SET estado = 'emparejada'")) return [{ id: 1 }];
  if (t.startsWith('SELECT linea_id AS "lineaId", marca_previa')) return [{ lineaId: 50, marcaPrevia }];
  return [];
}

vi.mock('@/lib/db/drizzle', () => ({
  db: {
    execute: async (q: never) => ejecutar(q),
    transaction: async (fn: (tx: { execute: (q: never) => Promise<unknown> }) => Promise<unknown>) => fn({ execute: async (q: never) => ejecutar(q) }),
  },
}));
vi.mock('@/lib/contabilidad/bancos', () => ({
  cuentasBanco: async () => [{ id: 7, codigo: '110201', nombre: 'Banco', tipo: 'activo', imputable: true, activa: true }],
  tablaExiste: async () => true,
  textoLibre: (v: unknown) => (typeof v === 'string' ? v : null),
}));

import { emparejarExtracto, emparejarManual, desemparejar, ConciliacionError } from '@/lib/contabilidad/conciliacion';

beforeEach(() => { sentencias.length = 0; marcaPrevia = false; violarEn = null; });

describe('4 · un apunte, una línea del banco', () => {
  it('la migración 0224 hace ÚNICO el índice sobre el apunte', () => {
    const sqlMigracion = readFileSync('lib/db/migrations/0224_extracto_bancario.sql', 'utf8');
    expect(sqlMigracion).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS contabilidad_extracto_lineas_linea_uniq ON contabilidad_extracto_lineas \(linea_id\) WHERE linea_id IS NOT NULL/);
  });

  it('si otro emparejado se llevó el apunte (violación única), la pareja se descarta sin reventar', async () => {
    violarEn = "UPDATE contabilidad_extracto_lineas SET estado = 'emparejada'";
    const r = await emparejarExtracto(1, 9, 7);
    expect(r.emparejadas).toBe(0);
  });

  it('en el emparejado manual la violación sale como un 409 claro', async () => {
    violarEn = "UPDATE contabilidad_extracto_lineas SET estado = 'emparejada'";
    const err = await emparejarManual(1, 9, 1, 50).catch((e) => e);
    expect(err).toBeInstanceOf(ConciliacionError);
    expect(err.status).toBe(409);
    expect(err.message).toMatch(/ya está emparejado con otra línea/);
  });
});

describe('5 · desemparejar devuelve el apunte a como estaba', () => {
  it('si el emparejado CREÓ la marca, al desemparejar se borra', async () => {
    marcaPrevia = false;
    await desemparejar(1, 1);
    expect(sentencias.some((s) => s.startsWith('DELETE FROM contabilidad_conciliaciones'))).toBe(true);
    expect(sentencias.some((s) => s.includes("SET estado = 'pendiente'") && s.includes('marca_previa = false'))).toBe(true);
  });

  it('si el apunte ya tenía una marca hecha a mano, se queda con ella', async () => {
    marcaPrevia = true;
    await desemparejar(1, 1);
    expect(sentencias.some((s) => s.startsWith('DELETE FROM contabilidad_conciliaciones'))).toBe(false);
    expect(sentencias.some((s) => s.includes("SET estado = 'pendiente'"))).toBe(true);
  });

  it('el emparejado anota si la marca ya existía (marca_previa) según el INSERT devolvió o no fila', async () => {
    await emparejarExtracto(1, 9, 7);
    const upd = sentencias.find((s) => s.startsWith("UPDATE contabilidad_extracto_lineas SET estado = 'emparejada'"))!;
    expect(upd).toContain('marca_previa =');
  });
});
