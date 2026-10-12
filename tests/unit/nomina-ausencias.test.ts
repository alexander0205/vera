import { describe, it, expect } from 'vitest';
import { descuentaDias, diasAusentes, diasEntre, esTipoAusencia } from '@/lib/nomina/ausencias';
import { construirCorrida, periodoDeCorrida, type EmpleadoParaCorrida } from '@/lib/nomina/corrida';
import { TASAS_NOMINA_2026 } from '@/lib/config/nomina-tasas';

const MES = periodoDeCorrida('mensual', { periodo: '2026-11' })!; // 30 días
const Q2 = periodoDeCorrida('quincenal-2', { periodo: '2026-11' })!;
const emp = (extra: Partial<EmpleadoParaCorrida> = {}): EmpleadoParaCorrida => ({
  id: 1, nombres: 'Ana', apellidos: 'Prueba', cedula: null, cargo: null, salarioBaseCents: 3_000_000, estado: 'activo', ...extra,
});

describe('diasAusentes', () => {
  it('cuenta cada día una sola vez aunque se solapen o vengan desordenadas', () => {
    const a = [{ inicio: '2026-11-10', fin: '2026-11-12' }, { inicio: '2026-11-01', fin: '2026-11-03' }, { inicio: '2026-11-11', fin: '2026-11-14' }];
    expect(diasAusentes('2026-11-01', '2026-11-30', a)).toBe(3 + 5);
  });
  it('recorta al rango pedido', () => {
    const a = [{ inicio: '2026-10-25', fin: '2026-11-05' }];
    expect(diasAusentes('2026-11-01', '2026-11-30', a)).toBe(5);
    expect(diasAusentes('2026-12-01', '2026-12-31', a)).toBe(0);
  });
  it('sin ausencias o con rango al revés, cero', () => {
    expect(diasAusentes('2026-11-01', '2026-11-30', undefined)).toBe(0);
    expect(diasAusentes('2026-11-30', '2026-11-01', [{ inicio: '2026-11-01', fin: '2026-11-30' }])).toBe(0);
  });
  it('un rango contenido en otro no suma de más', () => {
    expect(diasAusentes('2026-11-01', '2026-11-30', [{ inicio: '2026-11-01', fin: '2026-11-30' }, { inicio: '2026-11-05', fin: '2026-11-06' }])).toBe(30);
  });
  it('cruza fin de año', () => {
    expect(diasEntre('2026-12-30', '2027-01-02')).toBe(4);
    expect(diasAusentes('2026-12-01', '2027-01-31', [{ inicio: '2026-12-30', fin: '2027-01-02' }])).toBe(4);
  });
});

describe('tipos', () => {
  it('solo la licencia con pago no descuenta', () => {
    expect(descuentaDias('falta')).toBe(true);
    expect(descuentaDias('licencia_sin_pago')).toBe(true);
    expect(descuentaDias('licencia_con_pago')).toBe(false);
    expect(['falta', 'x', null, 5, {}].map(esTipoAusencia)).toEqual([true, false, false, false, false]);
  });
});

describe('construirCorrida con ausencias', () => {
  const base = construirCorrida([emp()], TASAS_NOMINA_2026, MES).lineas[0];
  it('3 días de falta pagan 27/30 del mes', () => {
    const l = construirCorrida([emp({ ausencias: [{ inicio: '2026-11-04', fin: '2026-11-06' }] })], TASAS_NOMINA_2026, MES).lineas[0];
    expect(l.diasPagados).toBe(27);
    expect(l.diasPeriodo).toBe(30);
    expect(l.brutoCents).toBe(Math.round(3_000_000 * 27 / 30));
    expect(l.brutoCents).toBeLessThan(base.brutoCents);
  });
  it('sin ausencias nada cambia', () => {
    const l = construirCorrida([emp({ ausencias: [] })], TASAS_NOMINA_2026, MES).lineas[0];
    expect(l).toEqual(base);
  });
  it('ausente todo el período: no hay línea', () => {
    const r = construirCorrida([emp({ ausencias: [{ inicio: '2026-11-01', fin: '2026-11-30' }] })], TASAS_NOMINA_2026, MES);
    expect(r.lineas).toHaveLength(0);
  });
  it('la falta de la primera quincena no toca la segunda', () => {
    const sin = construirCorrida([emp()], TASAS_NOMINA_2026, Q2).lineas[0];
    const con = construirCorrida([emp({ ausencias: [{ inicio: '2026-11-02', fin: '2026-11-03' }] })], TASAS_NOMINA_2026, Q2).lineas[0];
    expect(con.diasPagados).toBe(sin.diasPagados);
  });
  it('falta antes del ingreso no se resta dos veces', () => {
    const l = construirCorrida([emp({ fechaIngreso: '2026-11-21', ausencias: [{ inicio: '2026-11-15', fin: '2026-11-22' }] })], TASAS_NOMINA_2026, MES).lineas[0];
    expect(l.diasPagados).toBe(8); // 21..30 son 10 días, menos 21 y 22
  });
});
