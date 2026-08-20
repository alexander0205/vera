/**
 * Tests unitarios del cálculo de cuotas de depreciación lineal (Nivel 4.2).
 *
 * `calcularCuotas` es función pura: dada una ficha de activo y el mes actual,
 * devuelve las cuotas mensuales vencidas. La lógica delicada es el redondeo —
 * la suma de las cuotas tiene que dar EXACTAMENTE `costo − residual` sin bajar
 * nunca del valor residual — y el corte por vida útil y por mes actual. Nada de
 * eso se puede ejercitar bien contra los datos del dev, de ahí las pruebas.
 *
 * Al ser función pura no hacen falta DB ni navegador: `npm test` (vitest).
 */

import { test, describe } from 'vitest';
import assert from 'node:assert/strict';
import { calcularCuotas, type ActivoParaDepreciar } from '@/lib/contabilidad/depreciacion';

/** Un edificio de RD$1,200,000 a 4 años (48 meses), sin residual. */
const edificio: ActivoParaDepreciar = {
  costoCents: 120_000_000,
  valorResidualCents: 0,
  vidaUtilMeses: 48,
  fechaAdquisicion: '2026-01-15',
};

describe('calcularCuotas — cronología', () => {
  test('la primera cuota es el mes SIGUIENTE al de adquisición', () => {
    // Adquirido 2026-01-15 → primera cuota febrero 2026, no enero.
    const cuotas = calcularCuotas(edificio, '2026-02-20');
    assert.equal(cuotas.length, 1);
    assert.equal(cuotas[0].periodo, '2026-02-01');
  });

  test('acumula una cuota por mes vencido', () => {
    const cuotas = calcularCuotas(edificio, '2026-05-01');
    // feb, mar, abr, may = 4 cuotas.
    assert.equal(cuotas.length, 4);
    assert.deepEqual(cuotas.map((c) => c.periodo),
      ['2026-02-01', '2026-03-01', '2026-04-01', '2026-05-01']);
  });

  test('no genera cuotas antes del primer mes', () => {
    // El mismo mes de la adquisición todavía no deprecia.
    assert.deepEqual(calcularCuotas(edificio, '2026-01-31'), []);
  });

  test('cruza el fin de año en el conteo de meses', () => {
    const cuotas = calcularCuotas(edificio, '2027-02-01');
    // feb-2026 … feb-2027 inclusive = 13 cuotas.
    assert.equal(cuotas.length, 13);
    assert.equal(cuotas[0].periodo, '2026-02-01');
    assert.equal(cuotas[12].periodo, '2027-02-01');
  });
});

describe('calcularCuotas — montos y redondeo', () => {
  test('cuota lineal exacta cuando divide justo', () => {
    // 120,000,000 / 48 = 2,500,000 exacto.
    const cuotas = calcularCuotas(edificio, '2030-12-01'); // ya pasada toda la vida
    assert.equal(cuotas.length, 48);
    assert.ok(cuotas.every((c) => c.montoCents === 2_500_000));
    const suma = cuotas.reduce((s, c) => s + c.montoCents, 0);
    assert.equal(suma, 120_000_000);
  });

  test('la última cuota absorbe el redondeo y la suma da la base exacta', () => {
    // 100 / 3 no divide: regular = round(33.33) = 33, última = 100 − 66 = 34.
    const activo: ActivoParaDepreciar = {
      costoCents: 100, valorResidualCents: 0, vidaUtilMeses: 3,
      fechaAdquisicion: '2026-01-10',
    };
    const cuotas = calcularCuotas(activo, '2027-01-01');
    assert.equal(cuotas.length, 3);
    assert.deepEqual(cuotas.map((c) => c.montoCents), [33, 33, 34]);
    assert.equal(cuotas.reduce((s, c) => s + c.montoCents, 0), 100);
  });

  test('respeta el valor residual: solo deprecia costo − residual', () => {
    // Equipo 10,000 con residual 1,000 y vida 3 → base 9,000, cuota 3,000.
    const activo: ActivoParaDepreciar = {
      costoCents: 10_000, valorResidualCents: 1_000, vidaUtilMeses: 3,
      fechaAdquisicion: '2026-01-05',
    };
    const cuotas = calcularCuotas(activo, '2027-01-01');
    assert.equal(cuotas.reduce((s, c) => s + c.montoCents, 0), 9_000);
    assert.ok(cuotas.every((c) => c.montoCents === 3_000));
  });

  test('nunca deprecia más allá de la vida útil', () => {
    // Muchos meses después: se topa en las 48 cuotas, ni una más.
    assert.equal(calcularCuotas(edificio, '2099-01-01').length, 48);
  });

  test('omite cuotas de monto 0 (base menor que la vida útil)', () => {
    // base 3 con vida 8 → cuota regular round(0.375)=0; solo la última (=3) cuenta.
    const activo: ActivoParaDepreciar = {
      costoCents: 3, valorResidualCents: 0, vidaUtilMeses: 8,
      fechaAdquisicion: '2026-01-01',
    };
    const cuotas = calcularCuotas(activo, '2030-01-01');
    assert.equal(cuotas.length, 1);
    assert.equal(cuotas[0].montoCents, 3);
    assert.equal(cuotas[0].periodo, '2026-09-01'); // 8ª cuota desde feb-2026
  });

  test('sin base depreciable no hay cuotas', () => {
    const activo: ActivoParaDepreciar = {
      costoCents: 5_000, valorResidualCents: 5_000, vidaUtilMeses: 12,
      fechaAdquisicion: '2026-01-01',
    };
    assert.deepEqual(calcularCuotas(activo, '2030-01-01'), []);
  });
});
