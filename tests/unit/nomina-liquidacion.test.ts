import { describe, it, expect } from 'vitest';
import {
  calcularLiquidacion, diasPreaviso, diasVacacionesProporcionales, esMotivoSalida, llevaIndemnizacion,
  MOTIVOS_SALIDA, type EntradaLiquidacion,
} from '@/lib/nomina/liquidacion';

const base: EntradaLiquidacion = {
  fechaIngreso: '2021-01-10', fechaSalida: '2026-10-09', motivo: 'desahucio',
  salarioMensualCents: 2_383_000, // 23,830 → salario diario RD$1,000.00
  regalia: null,
};
const comp = (r: ReturnType<typeof calcularLiquidacion>, c: string) => r.componentes.find((x) => x.clave === c);

describe('tablas del Código de Trabajo', () => {
  it('preaviso por meses de servicio', () => {
    expect([0, 2, 3, 5, 6, 11, 12, 60].map(diasPreaviso)).toEqual([0, 0, 7, 7, 14, 14, 28, 28]);
  });
  it('vacaciones proporcionales antes y después del año', () => {
    expect([0, 4, 5, 6, 8, 11].map(diasVacacionesProporcionales)).toEqual([0, 0, 6, 7, 9, 12]);
    expect(diasVacacionesProporcionales(12)).toBe(0); // acaba de cumplir el año: el período nuevo empieza en cero
    expect(diasVacacionesProporcionales(18)).toBe(7); // 14 × 6/12
    expect(diasVacacionesProporcionales(66)).toBe(9); // 18 × 6/12: pasó los 5 años
  });
  it('motivos', () => {
    expect(MOTIVOS_SALIDA.filter(llevaIndemnizacion)).toEqual(['desahucio', 'despido_injustificado', 'dimision_justificada']);
    expect(esMotivoSalida('desahucio')).toBe(true);
    for (const v of ['robo', '', null, undefined, 5]) expect(esMotivoSalida(v)).toBe(false);
  });
});

describe('calcularLiquidacion', () => {
  it('desahucio con 5 años y 9 meses: preaviso 28 días y cesantía 21 días por año', () => {
    const r = calcularLiquidacion(base);
    expect(r.mesesServicio).toBe(69);
    expect(r.salarioDiarioCents).toBe(100_000);
    expect(comp(r, 'preaviso')?.dias).toBe(28);
    expect(comp(r, 'preaviso')?.montoCents).toBe(2_800_000);
    // 69 meses ≥ 60: 23 días por año × 5.75 años.
    expect(comp(r, 'cesantia')?.dias).toBe(132.25);
    expect(comp(r, 'cesantia')?.montoCents).toBe(13_225_000);
    expect(comp(r, 'preaviso')?.cotiza).toBe(false);
    expect(comp(r, 'cesantia')?.cotiza).toBe(false);
  });

  it('el total es la suma de los componentes', () => {
    const r = calcularLiquidacion({ ...base, regalia: { regaliaCents: 1_500_000, exentoCents: 1_500_000, gravadoCents: 0, devengadoRealCents: 0, devengadoEstimadoCents: 0, mesesEstimados: [], mesesTrabajados: 9.3 } });
    expect(r.totalCents).toBe(r.componentes.reduce((s, c) => s + c.montoCents, 0));
    expect(comp(r, 'regalia')?.montoCents).toBe(1_500_000);
  });

  it('con 4 meses: preaviso 7 días, cesantía 6 días y nada de vacaciones', () => {
    const r = calcularLiquidacion({ ...base, fechaIngreso: '2026-06-05' });
    expect(r.mesesServicio).toBe(4);
    expect(comp(r, 'preaviso')?.dias).toBe(7);
    expect(comp(r, 'cesantia')?.dias).toBe(6);
    expect(comp(r, 'vacaciones')).toBeUndefined();
  });

  it('con menos de 3 meses no hay indemnización y lo avisa', () => {
    const r = calcularLiquidacion({ ...base, fechaIngreso: '2026-08-15' });
    expect(r.componentes.filter((c) => c.clave === 'preaviso' || c.clave === 'cesantia')).toEqual([]);
    expect(r.avisos.join(' ')).toMatch(/menos de 3 meses/);
  });

  it('renuncia, mutuo acuerdo y despido justificado: sin preaviso ni cesantía, con vacaciones', () => {
    for (const motivo of ['renuncia', 'mutuo_acuerdo', 'despido_justificado'] as const) {
      const r = calcularLiquidacion({ ...base, motivo, fechaIngreso: '2025-11-01' });
      expect(comp(r, 'preaviso')).toBeUndefined();
      expect(comp(r, 'cesantia')).toBeUndefined();
      expect(comp(r, 'vacaciones')).toBeDefined();
    }
  });

  it('despido injustificado y dimisión justificada pagan igual que el desahucio; el despido avisa del art. 95', () => {
    const d = calcularLiquidacion(base);
    for (const motivo of ['despido_injustificado', 'dimision_justificada'] as const) {
      const r = calcularLiquidacion({ ...base, motivo });
      expect(r.totalCents).toBe(d.totalCents);
    }
    expect(calcularLiquidacion({ ...base, motivo: 'despido_injustificado' }).avisos.join(' ')).toMatch(/art\. 95/);
    expect(calcularLiquidacion({ ...base, motivo: 'renuncia' }).avisos.join(' ')).toMatch(/preaviso/);
  });

  it('las vacaciones cotizan y usan los días pendientes si se indican', () => {
    const auto = calcularLiquidacion({ ...base, fechaIngreso: '2025-11-01' }); // 11 meses
    expect(comp(auto, 'vacaciones')?.dias).toBe(12); // 11 meses: 12 días (art. 180)
    expect(comp(auto, 'vacaciones')?.cotiza).toBe(true);
    const manual = calcularLiquidacion({ ...base, diasVacacionesPendientes: 14 });
    expect(comp(manual, 'vacaciones')?.dias).toBe(14);
    expect(comp(manual, 'vacaciones')?.montoCents).toBe(1_400_000);
    expect(comp(calcularLiquidacion({ ...base, diasVacacionesPendientes: 0 }), 'vacaciones')).toBeUndefined();
  });

  it('el salario cero o negativo no produce montos negativos', () => {
    for (const s of [0, -100]) {
      const r = calcularLiquidacion({ ...base, salarioMensualCents: s });
      expect(r.totalCents).toBe(0);
      expect(r.componentes.every((c) => c.montoCents >= 0)).toBe(true);
    }
  });

  it('salida el mismo día que entró, o antes: nada', () => {
    expect(calcularLiquidacion({ ...base, fechaIngreso: '2026-10-09' }).totalCents).toBe(0);
    expect(calcularLiquidacion({ ...base, fechaIngreso: '2027-01-01' }).mesesServicio).toBe(0);
  });

  it('un monto en centavos con salario que no divide exacto se redondea sin decimales', () => {
    const r = calcularLiquidacion({ ...base, salarioMensualCents: 3_000_000, fechaIngreso: '2026-01-01' });
    expect(Number.isInteger(r.salarioDiarioCents)).toBe(true);
    for (const c of r.componentes) expect(Number.isInteger(c.montoCents)).toBe(true);
  });
});
