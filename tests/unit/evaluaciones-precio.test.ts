import { describe, expect, it } from 'vitest';
import { repartir } from '@/lib/administracion-escolar/plan-cobro';

describe('precio de las evaluaciones', () => {
  it('cobra RD$200 exactos en cada una de las tres cuotas de Inicial', () => {
    expect(repartir(60_000, [33_334, 33_333, 33_333]))
      .toEqual([20_000, 20_000, 20_000]);
  });

  it('cobra RD$200 exactos en las cuatro cuotas de Primaria, incluida la final', () => {
    expect(repartir(80_000, [25_000, 25_000, 25_000, 25_000]))
      .toEqual([20_000, 20_000, 20_000, 20_000]);
  });
});
