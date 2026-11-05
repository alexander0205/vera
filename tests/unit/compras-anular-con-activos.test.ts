/**
 * Anular una compra con fichas de activo fijo: sin depreciación ni
 * reclasificación se quitan las fichas; con depreciación, bajas o una ficha
 * pasada a la cuenta de su categoría, se bloquea con un mensaje claro.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';

const dialect = new PgDialect();
const sentencias: string[] = [];
let fichas = { fichas: 0, reclasificadas: 0, historia: 0 };

function ejecutar(q: never): unknown[] {
  const t = dialect.sqlToQuery(q).sql.trim().replace(/\s+/g, ' ');
  sentencias.push(t);
  if (t.includes('FROM compras_locales WHERE team_id')) return [{ id: 5, estado: 'registrada' }];
  if (t.includes('FROM pagos_proveedores')) return [{ pagos: 0 }];
  if (t.includes('AS reclasificadas')) return [fichas];
  return [];
}

vi.mock('@/lib/db/drizzle', () => {
  const tx = {
    execute: async (q: never) => ejecutar(q),
    update: () => ({ set: () => ({ where: async () => undefined }) }),
    select: () => ({ from: () => ({ where: async () => [] }) }),
  };
  return { db: { execute: async (q: never) => ejecutar(q), transaction: async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx) } };
});
vi.mock('@/lib/contabilidad/depreciacion', () => ({ activosCompletosDisponible: async () => true }));
vi.mock('@/lib/contabilidad/activos-fijos-db', () => ({ crearFichasDesdeCompra: async () => 0 }));
vi.mock('@/lib/contabilidad/asientos', () => ({ generarAsientoCompra: async () => ({}), generarAsientoCompraAnulada: async () => ({ creado: false }) }));
vi.mock('@/lib/inventario/entradas', () => ({ registrarEntradas: async () => undefined, revertirEntradas: async () => undefined }));

import { anularCompra, CompraError } from '@/lib/compras/registrar';

beforeEach(() => { sentencias.length = 0; fichas = { fichas: 0, reclasificadas: 0, historia: 0 }; });

describe('anularCompra con fichas de activo fijo', () => {
  it('sin cuotas ni reclasificación borra las fichas de esa compra', async () => {
    fichas = { fichas: 2, reclasificadas: 0, historia: 0 };
    await anularCompra(1, 9, 5, 'se registró dos veces');
    expect(sentencias.some((s) => s.startsWith('DELETE FROM contabilidad_activos_fijos') && s.includes('compra_id'))).toBe(true);
  });

  it('con depreciación o bajas bloquea la anulación y no borra nada', async () => {
    fichas = { fichas: 1, reclasificadas: 0, historia: 3 };
    await expect(anularCompra(1, 9, 5, 'se registró dos veces')).rejects.toThrow(/ya tiene depreciación o bajas/);
    expect(sentencias.some((s) => s.startsWith('DELETE'))).toBe(false);
  });

  it('si la ficha se pasó a la cuenta de su categoría, bloquea y explica cómo deshacerlo', async () => {
    fichas = { fichas: 1, reclasificadas: 1, historia: 0 };
    const err = await anularCompra(1, 9, 5, 'se registró dos veces').catch((e) => e);
    expect(err).toBeInstanceOf(CompraError);
    expect(err.message).toMatch(/Quítale la categoría/);
    expect(sentencias.some((s) => s.startsWith('DELETE'))).toBe(false);
  });

  it('una compra sin fichas se anula como siempre', async () => {
    await expect(anularCompra(1, 9, 5, 'se registró dos veces')).resolves.toBeTruthy();
    expect(sentencias.some((s) => s.startsWith('DELETE'))).toBe(false);
  });
});
