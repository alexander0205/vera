/**
 * Unit tests — normalización de ids en validarPertenencia.
 *
 * Solo se prueba `comoId` a través del comportamiento observable sin DB: los
 * ids que no son enteros positivos deben RECHAZARSE, nunca saltarse. Saltarlos
 * fue el bug: mandar el id entre comillas ("501") anulaba la validación entera
 * y Postgres luego casteaba el string a int4, dejando la fila apuntando a otra
 * empresa.
 */

import { describe, it, expect, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/db/drizzle', () => ({ db: {} }));

const { validarPertenencia } = await import('@/lib/administracion-escolar/pertenencia');

describe('validarPertenencia — ids inválidos se rechazan, no se saltan', () => {
  it.each([
    ['texto',            'abc'],
    ['cero',             0],
    ['negativo',         -3],
    ['decimal',          1.5],
    ['booleano',         true],
    ['objeto',           {}],
    ['array',            [1]],
    ['string vacío',     ''],
    ['NaN',              NaN],
  ])('%s → error, sin tocar la DB', async (_caso, valor) => {
    const r = await validarPertenencia(1, { estudiante: valor });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('Estudiante inválido');
  });

  it('null y undefined se ignoran (campos opcionales)', async () => {
    const r = await validarPertenencia(1, { estudiante: null, curso: undefined });
    expect(r).toEqual({ ok: true, ids: {} });
  });
});
