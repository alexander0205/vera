import { describe, expect, it } from 'vitest';
import { repartir } from '@/lib/administracion-escolar/plan-cobro';
import { montosPorCuota } from '@/lib/administracion-escolar/repartir';

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

describe('lo que sale en cada cuota según qué es el cobro', () => {
  it('una colegiatura cobra la tarifa entera en cada cuota', () => {
    expect(montosPorCuota('mensualidad', 280_000, [10_000, 10_000, 10_000]))
      .toEqual([280_000, 280_000, 280_000]);
  });

  it('lo demás reparte la tarifa como total del año', () => {
    expect(montosPorCuota('actividad', 60_000, [33_334, 33_333, 33_333]))
      .toEqual([20_000, 20_000, 20_000]);
    expect(montosPorCuota('otro', 280_000, Array(10).fill(10_000)))
      .toEqual(Array(10).fill(28_000));
  });
});
