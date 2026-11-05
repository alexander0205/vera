/**
 * 3 · Cambiar la categoría de un activo con depreciación o bajas está bloqueado.
 * 9 · Quitar la conciliación de un apunte devuelve a pendiente su línea del extracto.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';

const dialect = new PgDialect();
const registro: string[] = [];
let historia = 0;

function ejecutar(q: never): unknown[] {
  const t = dialect.sqlToQuery(q).sql.trim().replace(/\s+/g, ' ');
  registro.push(t);
  if (t.includes('FROM contabilidad_activos_fijos WHERE id =')) {
    return [{ id: 10, costo: '100000', enRevision: false, categoria: 'mobiliario', compraId: null, adquirido: '2026-01-01' }];
  }
  if (t.includes('to_regclass')) return [{ existe: true }];
  if (t.includes('AS historia')) return [{ historia }];
  if (t.startsWith('SELECT id, imputable, activa FROM contabilidad_cuentas')) return [];
  if (t.startsWith('SELECT id, tipo, imputable, activa, codigo FROM contabilidad_cuentas')) return [{ id: 1, tipo: 'activo', imputable: true, activa: true, codigo: '1204' }];
  if (t.startsWith('SELECT id FROM contabilidad_asiento_lineas')) return [{ id: 1 }];
  if (t.includes('UPDATE contabilidad_activos_fijos SET')) return [{ id: 10 }];
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
vi.mock('@/lib/contabilidad/config', () => ({ getConfig: async () => ({}), cuentasDeSalida: async () => ({ cuentas: [], porMetodo: {} }) }));
vi.mock('@/lib/contabilidad/asientos', () => ({ generarAsientoCompra: async () => ({ creado: false }) }));

import { editarActivoFijo } from '@/lib/contabilidad/activos-fijos-db';
import { conciliar } from '@/lib/contabilidad/bancos';

beforeEach(() => { registro.length = 0; historia = 0; });

describe('editarActivoFijo: categoría con historia asentada', () => {
  it('con cuotas o bajas no deja cambiar la categoría y no escribe nada', async () => {
    historia = 2;
    await expect(editarActivoFijo(1, 9, 10, { categoria: 'edificios' })).rejects.toThrow(/ya tiene depreciación o bajas/);
    expect(registro.some((s) => s.includes('UPDATE contabilidad_activos_fijos SET'))).toBe(false);
  });

  it('sin historia sí la cambia, y lo demás (nombre, ubicación) se edita siempre', async () => {
    await editarActivoFijo(1, 9, 10, { categoria: 'edificios' });
    expect(registro.some((s) => s.includes('UPDATE contabilidad_activos_fijos SET'))).toBe(true);
    registro.length = 0; historia = 3;
    await editarActivoFijo(1, 9, 10, { nombre: 'Butacas nuevas', ubicacion: 'Aula 2' });
    expect(registro.some((s) => s.includes('UPDATE contabilidad_activos_fijos SET'))).toBe(true);
  });

  it('pedir la misma categoría que ya tiene no cuenta como cambio', async () => {
    historia = 5;
    await expect(editarActivoFijo(1, 9, 10, { categoria: 'mobiliario' })).resolves.toEqual({ avisos: [] });
  });
});

describe('conciliar(false) y las líneas del extracto', () => {
  it('al quitar la marca, la línea emparejada del extracto vuelve a pendiente', async () => {
    const real = await vi.importActual<typeof import('@/lib/contabilidad/bancos')>('@/lib/contabilidad/bancos');
    void real;
    // `conciliar` se prueba por el SQL que emite: borra la marca y libera la línea del extracto.
    await conciliar(1, 9, 7, [11], false, null);
    const texto = registro.join('\n');
    expect(texto).toContain('DELETE FROM contabilidad_conciliaciones');
    expect(texto).toContain("UPDATE contabilidad_extracto_lineas SET estado = 'pendiente'");
    expect(texto).toContain("estado = 'emparejada'");
  });
});
