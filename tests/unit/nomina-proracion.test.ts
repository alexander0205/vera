import { describe, it, expect } from 'vitest';
import {
  calcularNominaEmpleado, prorratearDesglose, pedazoPeriodo, type DesgloseNomina,
} from '@/lib/nomina/calculo';
import { construirCorrida, prorationDeTipo } from '@/lib/nomina/corrida';
import { tasasDelAnio } from '@/lib/config/nomina-tasas';

const tasas = tasasDelAnio(2026);

/** Los 10 campos en centavos que deben repartirse sin perder un centavo. */
const CAMPOS: (keyof DesgloseNomina)[] = [
  'brutoCents', 'afpEmpleadoCents', 'sfsEmpleadoCents', 'isrCents', 'otrasDeduccionesCents',
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

describe('prorratearDesglose', () => {
  const mensual = calcularNominaEmpleado({ salarioMensualCents: 5_000_000, tasas });
  const q1 = prorratearDesglose(mensual, 1, 2);
  const q2 = prorratearDesglose(mensual, 2, 2);

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
        q.afpEmpleadoCents + q.sfsEmpleadoCents + q.isrCents + q.otrasDeduccionesCents,
      );
      expect(q.totalPatronalCents).toBe(
        q.afpPatronalCents + q.sfsPatronalCents + q.srlPatronalCents + q.infotepPatronalCents,
      );
      expect(q.netoCents).toBe(q.brutoCents - q.totalDeduccionesCents);
    }
  });

  it('mensual (deTotal=1) no cambia el desglose', () => {
    expect(prorratearDesglose(mensual, 1, 1)).toEqual(mensual);
  });
});

describe('prorationDeTipo', () => {
  it('mapea cada tipo a su reparto', () => {
    expect(prorationDeTipo('mensual')).toEqual({ indice: 1, deTotal: 1 });
    expect(prorationDeTipo('quincenal')).toEqual({ indice: 1, deTotal: 2 });
    expect(prorationDeTipo('quincenal-1')).toEqual({ indice: 1, deTotal: 2 });
    expect(prorationDeTipo('quincenal-2')).toEqual({ indice: 2, deTotal: 2 });
    expect(prorationDeTipo('semanal')).toEqual({ indice: 1, deTotal: 4 });
  });
});

describe('construirCorrida con proración', () => {
  const empleados = [
    { id: 1, nombres: 'Ana', apellidos: 'X', cedula: null, cargo: null, salarioBaseCents: 5_000_000, estado: 'activo' },
    { id: 2, nombres: 'Bob', apellidos: 'Y', cedula: null, cargo: null, salarioBaseCents: 3_000_000, estado: 'activo' },
  ];

  it('la quincenal-1 + quincenal-2 suman la mensual en los totales', () => {
    const mensual = construirCorrida(empleados, tasas); // default mensual
    const q1 = construirCorrida(empleados, tasas, prorationDeTipo('quincenal-1'));
    const q2 = construirCorrida(empleados, tasas, prorationDeTipo('quincenal-2'));

    expect(q1.totales.totalNetoCents + q2.totales.totalNetoCents).toBe(mensual.totales.totalNetoCents);
    expect(q1.totales.totalBrutoCents + q2.totales.totalBrutoCents).toBe(mensual.totales.totalBrutoCents);
    expect(q1.totales.totalDeduccionesCents + q2.totales.totalDeduccionesCents).toBe(mensual.totales.totalDeduccionesCents);
    expect(q1.totales.totalPatronalCents + q2.totales.totalPatronalCents).toBe(mensual.totales.totalPatronalCents);
  });
});
