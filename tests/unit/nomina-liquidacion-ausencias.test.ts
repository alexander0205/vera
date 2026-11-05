import { describe, it, expect } from 'vitest';
import { calcularLiquidacion, diasPreaviso, diasVacacionesProporcionales, llevaIndemnizacion } from '@/lib/nomina/liquidacion';
import { calcularRegalia } from '@/lib/nomina/regalia';
import { diasAusentes, descuentaDias, esTipoAusencia, diasEntre } from '@/lib/nomina/ausencias';
import { construirCorrida, periodoDeCorrida, type EmpleadoParaCorrida } from '@/lib/nomina/corrida';
import { TASAS_NOMINA_2026 } from '@/lib/config/nomina-tasas';
import { esMigracionPendiente, toleraMigracionPendiente } from '@/lib/nomina/migracion-pendiente';

const SALARIO = 2_383_000; // RD$23,830 → salario diario RD$1,000 con divisor 23.83

describe('liquidación', () => {
  const entrada = {
    fechaIngreso: '2024-01-01', fechaSalida: '2026-07-01', motivo: 'desahucio' as const,
    salarioMensualCents: SALARIO, regalia: null,
  };

  it('preaviso por antigüedad (art. 76)', () => {
    expect(diasPreaviso(2)).toBe(0);
    expect(diasPreaviso(3)).toBe(7);
    expect(diasPreaviso(6)).toBe(14);
    expect(diasPreaviso(12)).toBe(28);
  });

  it('desahucio con 2.5 años: preaviso 28 días y cesantía por días ganados, a salario diario', () => {
    const r = calcularLiquidacion(entrada);
    expect(r.salarioDiarioCents).toBe(100_000);
    const pre = r.componentes.find((c) => c.clave === 'preaviso')!;
    const ces = r.componentes.find((c) => c.clave === 'cesantia')!;
    expect(pre.dias).toBe(28);
    expect(pre.montoCents).toBe(28 * 100_000);
    expect(ces.dias).toBeGreaterThan(0);
    expect(ces.montoCents).toBe(Math.round(ces.dias! * 100_000));
    expect(r.totalCents).toBe(r.componentes.reduce((s, c) => s + c.montoCents, 0));
  });

  it('preaviso y cesantía no cotizan; las vacaciones sí', () => {
    const r = calcularLiquidacion(entrada);
    for (const c of r.componentes) expect(c.cotiza).toBe(c.clave === 'vacaciones');
  });

  it('renuncia: no hay preaviso ni cesantía, solo lo proporcional', () => {
    const r = calcularLiquidacion({ ...entrada, motivo: 'renuncia' });
    expect(r.componentes.some((c) => c.clave === 'preaviso' || c.clave === 'cesantia')).toBe(false);
    expect(llevaIndemnizacion('renuncia')).toBe(false);
    expect(llevaIndemnizacion('despido_injustificado')).toBe(true);
  });

  it('menos de 3 meses no genera indemnización y avisa', () => {
    const r = calcularLiquidacion({ ...entrada, fechaIngreso: '2026-05-01' });
    expect(r.componentes.some((c) => c.clave === 'preaviso' || c.clave === 'cesantia')).toBe(false);
    expect(r.avisos.join(' ')).toMatch(/3 meses/);
  });

  it('vacaciones pendientes indicadas a mano mandan sobre la estimación', () => {
    const r = calcularLiquidacion({ ...entrada, diasVacacionesPendientes: 10 });
    expect(r.componentes.find((c) => c.clave === 'vacaciones')!.montoCents).toBe(10 * 100_000);
  });

  it('vacaciones proporcionales del primer año (art. 180)', () => {
    expect(diasVacacionesProporcionales(4)).toBe(0);
    expect(diasVacacionesProporcionales(5)).toBe(6);
    expect(diasVacacionesProporcionales(11)).toBe(12);
  });

  it('incluye la regalía proporcional del año de salida', () => {
    const regalia = calcularRegalia({
      anio: 2026, salarioMensualCents: SALARIO, fechaIngreso: '2024-01-01', fechaSalida: '2026-07-01',
      devengadoPorMes: {}, topeExentoCents: null,
    });
    const r = calcularLiquidacion({ ...entrada, regalia });
    const reg = r.componentes.find((c) => c.clave === 'regalia')!;
    expect(reg.montoCents).toBe(regalia.regaliaCents);
    expect(reg.cotiza).toBe(false);
  });
});

describe('ausencias', () => {
  it('cuenta los días del rango dentro del período', () => {
    expect(diasEntre('2026-11-03', '2026-11-05')).toBe(3);
    expect(diasAusentes('2026-11-01', '2026-11-30', [{ inicio: '2026-11-03', fin: '2026-11-05' }])).toBe(3);
  });

  it('recorta lo que se sale del período', () => {
    expect(diasAusentes('2026-11-01', '2026-11-30', [{ inicio: '2026-10-28', fin: '2026-11-02' }])).toBe(2);
    expect(diasAusentes('2026-11-01', '2026-11-30', [{ inicio: '2026-12-01', fin: '2026-12-05' }])).toBe(0);
  });

  it('ausencias solapadas o desordenadas cuentan cada día una sola vez', () => {
    const r = diasAusentes('2026-11-01', '2026-11-30', [
      { inicio: '2026-11-10', fin: '2026-11-14' },
      { inicio: '2026-11-03', fin: '2026-11-06' },
      { inicio: '2026-11-12', fin: '2026-11-16' },
    ]);
    expect(r).toBe(4 + 7); // 3-6 y 10-16
  });

  it('licencia con pago no descuenta días', () => {
    expect(descuentaDias('falta')).toBe(true);
    expect(descuentaDias('licencia_sin_pago')).toBe(true);
    expect(descuentaDias('licencia_con_pago')).toBe(false);
    expect(esTipoAusencia('vacaciones')).toBe(false);
  });

  const NOV = periodoDeCorrida('mensual', { periodo: '2026-11' })!;
  const emp = (extra: Partial<EmpleadoParaCorrida> = {}): EmpleadoParaCorrida => ({
    id: 1, nombres: 'Ana', apellidos: 'Prueba', cedula: null, cargo: null, salarioBaseCents: 3_000_000, estado: 'activo', ...extra,
  });

  it('una falta de 3 días baja el sueldo del mes 3/30', () => {
    const sin = construirCorrida([emp()], TASAS_NOMINA_2026, NOV).lineas[0];
    const con = construirCorrida([emp({ ausencias: [{ inicio: '2026-11-03', fin: '2026-11-05' }] })], TASAS_NOMINA_2026, NOV).lineas[0];
    expect(sin.brutoCents).toBe(3_000_000);
    expect(con.diasPagados).toBe(27);
    expect(con.brutoCents).toBe(2_700_000);
  });

  it('un mes entero ausente no genera línea o la deja en cero, nunca negativa', () => {
    const { lineas } = construirCorrida([emp({ ausencias: [{ inicio: '2026-11-01', fin: '2026-11-30' }] })], TASAS_NOMINA_2026, NOV);
    for (const l of lineas) expect(l.brutoCents).toBeGreaterThanOrEqual(0);
  });
});

describe('migraciones pendientes', () => {
  it('reconoce tabla o columna inexistente, también envuelta por el ORM', () => {
    expect(esMigracionPendiente({ code: '42P01' })).toBe(true);
    expect(esMigracionPendiente({ code: '42703' })).toBe(true);
    expect(esMigracionPendiente(Object.assign(new Error('Failed query'), { cause: { code: '42P01' } }))).toBe(true);
    expect(esMigracionPendiente(new Error('otra cosa'))).toBe(false);
    expect(esMigracionPendiente(null)).toBe(false);
  });

  it('devuelve el valor vacío solo para ese error; los demás siguen subiendo', async () => {
    expect(await toleraMigracionPendiente(async () => { throw { code: '42P01' }; }, [] as number[])).toEqual([]);
    await expect(toleraMigracionPendiente(async () => { throw new Error('conexión'); }, 0)).rejects.toThrow('conexión');
    expect(await toleraMigracionPendiente(async () => 7, 0)).toBe(7);
  });
});
