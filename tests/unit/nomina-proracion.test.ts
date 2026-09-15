import { describe, it, expect } from 'vitest';
import {
  calcularNominaEmpleado, repartirDesglose, pedazoPeriodo, type DesgloseNomina,
} from '@/lib/nomina/calculo';
import { construirCorrida, periodoDeCorrida, normalizarTipoCorrida } from '@/lib/nomina/corrida';
import { tasasDelAnio } from '@/lib/config/nomina-tasas';

const tasas = tasasDelAnio(2026);

/** Los 10 campos en centavos que deben repartirse sin perder un centavo. */
const CAMPOS: (keyof DesgloseNomina)[] = [
  'brutoCents', 'salarioCotizableCents', 'afpEmpleadoCents', 'sfsEmpleadoCents', 'isrCents',
  'dependientesAdicionalesCents', 'otrasDeduccionesCents',
  'totalDeduccionesCents', 'afpPatronalCents', 'sfsPatronalCents', 'srlPatronalCents',
  'infotepPatronalCents', 'totalPatronalCents', 'netoCents', 'baseIsrMensualCents',
];

describe('pedazoPeriodo', () => {
  it('deTotal ≤ 1 devuelve el total entero (mensual)', () => {
    expect(pedazoPeriodo(4519101, 1, 1)).toBe(4519101);
  });

  it('las dos quincenas suman el mes al centavo, incluso con montos impares', () => {
    for (const total of [0, 1, 100, 4519101, 999999, 123457]) {
      const q1 = pedazoPeriodo(total, 1, 2);
      const q2 = pedazoPeriodo(total, 2, 2);
      expect(q1 + q2).toBe(total);
    }
  });

  it('cuatro semanas suman el mes al centavo', () => {
    const total = 123457;
    const suma = [1, 2, 3, 4].reduce((s, k) => s + pedazoPeriodo(total, k, 4), 0);
    expect(suma).toBe(total);
  });
});

describe('repartirDesglose', () => {
  // Con un dependiente adicional impar para que la cápita también se reparta.
  const mensual = calcularNominaEmpleado({
    salarioMensualCents: 5_000_000, tasas, dependientesAdicionales: 1, capitaDependienteCents: 191_979,
  });
  const q1 = repartirDesglose(mensual, 0, 1, 2);
  const q2 = repartirDesglose(mensual, 1, 1, 2);

  it('cada quincena suma exactamente el mes en todos los campos', () => {
    for (const c of CAMPOS) {
      expect(q1[c] + q2[c]).toBe(mensual[c]);
    }
  });

  it('cada quincena es ~la mitad del mes', () => {
    expect(q1.brutoCents).toBe(2_500_000);
    expect(q2.brutoCents).toBe(2_500_000);
    // El neto de la quincena es cercano a la mitad del neto mensual.
    expect(Math.abs(q1.netoCents - mensual.netoCents / 2)).toBeLessThanOrEqual(1);
  });

  it('los totales de la quincena siguen cuadrando internamente', () => {
    for (const q of [q1, q2]) {
      expect(q.totalDeduccionesCents).toBe(
        q.afpEmpleadoCents + q.sfsEmpleadoCents + q.isrCents + q.dependientesAdicionalesCents + q.otrasDeduccionesCents,
      );
      expect(q.totalPatronalCents).toBe(
        q.afpPatronalCents + q.sfsPatronalCents + q.srlPatronalCents + q.infotepPatronalCents,
      );
      expect(q.netoCents).toBe(q.brutoCents - q.totalDeduccionesCents);
    }
  });

  it('el pedazo entero no cambia el desglose', () => {
    expect(repartirDesglose(mensual, 0, 1, 1)).toEqual(mensual);
    expect(repartirDesglose(mensual, 0, 5, 5)).toEqual(mensual);
  });

  it('pesos desiguales: tres pedazos de 11, 4 y 15 suman el mes al centavo', () => {
    const a = repartirDesglose(mensual, 0, 11, 30);
    const b = repartirDesglose(mensual, 11, 4, 30);
    const c = repartirDesglose(mensual, 15, 15, 30);
    for (const campo of CAMPOS) expect(a[campo] + b[campo] + c[campo]).toBe(mensual[campo]);
    expect(a.netoCents).toBe(a.brutoCents - a.totalDeduccionesCents);
  });

  it('la cantidad de dependientes no se reparte: cada quincena dice cuántos cobra', () => {
    expect(q1.dependientesAdicionales).toBe(1);
    expect(q2.dependientesAdicionales).toBe(1);
    expect(q1.dependientesAdicionalesCents + q2.dependientesAdicionalesCents).toBe(191_979);
  });
});

describe('construirCorrida por quincenas', () => {
  const empleados = [
    { id: 1, nombres: 'Ana', apellidos: 'X', cedula: null, cargo: null, salarioBaseCents: 5_000_000, estado: 'activo' },
    { id: 2, nombres: 'Bob', apellidos: 'Y', cedula: null, cargo: null, salarioBaseCents: 3_000_000, estado: 'activo' },
  ];

  it('la quincenal-1 + quincenal-2 suman la mensual en los totales', () => {
    const mensual = construirCorrida(empleados, tasas, periodoDeCorrida('mensual', { periodo: '2026-11' })!);
    const q1 = construirCorrida(empleados, tasas, periodoDeCorrida('quincenal-1', { periodo: '2026-11' })!);
    const q2 = construirCorrida(empleados, tasas, periodoDeCorrida('quincenal-2', { periodo: '2026-11' })!);

    expect(q1.totales.totalNetoCents + q2.totales.totalNetoCents).toBe(mensual.totales.totalNetoCents);
    expect(q1.totales.totalBrutoCents + q2.totales.totalBrutoCents).toBe(mensual.totales.totalBrutoCents);
    expect(q1.totales.totalDeduccionesCents + q2.totales.totalDeduccionesCents).toBe(mensual.totales.totalDeduccionesCents);
    expect(q1.totales.totalPatronalCents + q2.totales.totalPatronalCents).toBe(mensual.totales.totalPatronalCents);
    expect(q1.lineas[0].brutoCents).toBe(2_500_000);
  });
});

describe('normalizarTipoCorrida', () => {
  it('acepta los cuatro tipos y convierte «quincenal» a secas en la primera quincena', () => {
    expect(normalizarTipoCorrida('mensual')).toBe('mensual');
    expect(normalizarTipoCorrida('QUINCENAL-2')).toBe('quincenal-2');
    expect(normalizarTipoCorrida('semanal')).toBe('semanal');
    expect(normalizarTipoCorrida('quincenal')).toBe('quincenal-1');
  });

  it('rechaza lo que todavía no tiene cálculo propio en vez de pagarlo como un mes', () => {
    expect(normalizarTipoCorrida('regalia')).toBeNull();
    expect(normalizarTipoCorrida('liquidacion')).toBeNull();
    expect(normalizarTipoCorrida('')).toBeNull();
    expect(normalizarTipoCorrida(undefined)).toBeNull();
  });
});
