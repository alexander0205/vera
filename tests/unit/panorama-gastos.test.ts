// tests/unit/panorama-gastos.test.ts
import { describe, it, expect } from 'vitest';
import {
  armarGanancias, armarGastos, mesesDelPeriodo, totalesPorTipo, type FilaGastoMes,
} from '@/lib/administracion-escolar/panorama-gastos';

const HOY = '2026-10-27';
const MESES = ['2026-08', '2026-09', '2026-10', '2026-11', '2026-12'];

describe('los gastos de cada mes', () => {
  it('suma nómina, gastos y compras por mes', () => {
    const filas: FilaGastoMes[] = [
      { key: '2026-09', tipo: 'nomina', centavos: 100_000_00 },
      { key: '2026-09', tipo: 'gastos', centavos: 5_000_00 },
      { key: '2026-09', tipo: 'gastos', centavos: 1_000_00 },
      { key: '2026-09', tipo: 'compras', centavos: 2_000_00 },
    ];
    const sep = armarGastos(filas, MESES, HOY).find((g) => g.key === '2026-09')!;
    expect(sep).toMatchObject({
      nominaCentavos: 100_000_00, gastosCentavos: 6_000_00, comprasCentavos: 2_000_00,
      totalCentavos: 108_000_00, nominaEstimada: false,
    });
  });

  it('del mes en curso en adelante, la nómina que falta se estima con la del último mes cerrado', () => {
    const filas: FilaGastoMes[] = [
      { key: '2026-08', tipo: 'nomina', centavos: 90_000_00 },
      { key: '2026-09', tipo: 'nomina', centavos: 100_000_00 },
      // Octubre: solo la primera quincena aprobada.
      { key: '2026-10', tipo: 'nomina', centavos: 50_000_00 },
    ];
    const g = armarGastos(filas, MESES, HOY);
    expect(g.map((m) => [m.key, m.nominaCentavos, m.nominaEstimada])).toEqual([
      ['2026-08', 90_000_00, false],
      ['2026-09', 100_000_00, false],
      ['2026-10', 100_000_00, true],
      ['2026-11', 100_000_00, true],
      ['2026-12', 100_000_00, true],
    ]);
    // Lo real del año no lleva lo estimado.
    expect(totalesPorTipo(g).find((t) => t.tipo === 'nomina')?.centavos).toBe(190_000_00);
  });

  it('un mes pasado sin nómina se queda en cero: no se inventa', () => {
    const g = armarGastos([{ key: '2026-09', tipo: 'nomina', centavos: 100_000_00 }], MESES, HOY);
    expect(g[0]).toMatchObject({ key: '2026-08', nominaCentavos: 0, nominaEstimada: false });
  });

  it('sin ninguna nómina no se estima nada', () => {
    expect(armarGastos([], MESES, HOY).every((m) => m.nominaCentavos === 0 && !m.nominaEstimada)).toBe(true);
  });
});

describe('ingresos − gastos', () => {
  it('la ganancia es caja − gastos; la proyectada, lo esperado − gastos', () => {
    const gastos = armarGastos([
      { key: '2026-09', tipo: 'nomina', centavos: 100_000_00 },
      { key: '2026-09', tipo: 'gastos', centavos: 10_000_00 },
    ], MESES, HOY);
    const r = armarGanancias([
      { key: '2026-09', cajaCentavos: 150_000_00, devengadoCentavos: 160_000_00 },
      { key: '2026-11', cajaCentavos: 0, devengadoCentavos: 160_000_00 },
    ], gastos, HOY);
    const sep = r.meses.find((m) => m.key === '2026-09')!;
    expect(sep).toMatchObject({ gananciaCentavos: 40_000_00, gananciaProyectadaCentavos: 50_000_00, transcurrido: true });
    const nov = r.meses.find((m) => m.key === '2026-11')!;
    expect(nov).toMatchObject({ gastosCentavos: 100_000_00, gananciaProyectadaCentavos: 60_000_00, transcurrido: false });
    // Lo que va del año: agosto, septiembre y octubre.
    expect(r.hastaHoy).toEqual({ ingresosCentavos: 150_000_00, gastosCentavos: 210_000_00, gananciaCentavos: -60_000_00 });
    // El año: lo esperado (320k) − todos los gastos con la nómina estimada (110k + 3 × 100k).
    expect(r.proyectado).toEqual({ ingresosCentavos: 320_000_00, gastosCentavos: 410_000_00, gananciaCentavos: -90_000_00 });
  });

  it('los meses del año escolar', () => {
    expect(mesesDelPeriodo({ fechaInicio: '2026-08-01', fechaFin: '2027-06-30' }, HOY)).toHaveLength(11);
    expect(mesesDelPeriodo({}, HOY).at(-1)).toBe('2027-01');
  });
});
