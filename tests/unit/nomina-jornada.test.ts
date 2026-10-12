import { describe, it, expect } from 'vitest';
import {
  avisosHorario, diasLibresDe, esHorario, HORARIO_LUNES_A_SABADO, HORARIO_LUNES_A_VIERNES, horasSemana, valorHoraCents,
} from '@/lib/nomina/jornada';

describe('horario semanal', () => {
  it('las 44 horas de ley y las 40 sin sábado', () => {
    expect(horasSemana(HORARIO_LUNES_A_SABADO)).toBe(44);
    expect(horasSemana(HORARIO_LUNES_A_VIERNES)).toBe(40);
    expect(avisosHorario(HORARIO_LUNES_A_SABADO)).toEqual([]);
  });

  it('días libres en palabras', () => {
    expect(diasLibresDe(HORARIO_LUNES_A_SABADO)).toBe('Domingo');
    expect(diasLibresDe(HORARIO_LUNES_A_VIERNES)).toBe('Sábado y domingo');
    expect(diasLibresDe({ ...HORARIO_LUNES_A_VIERNES, mie: 0 })).toBe('Miércoles, sábado y domingo');
  });

  it('avisa de las horas extra, de los días de más de 8 horas y de la falta de descanso', () => {
    const sabadoCompleto = { ...HORARIO_LUNES_A_SABADO, sab: 8 }; // 48 h: el ejemplo de la reunión
    expect(avisosHorario(sabadoCompleto)[0]).toContain('Las 4 de más son horas extra');
    expect(avisosHorario({ ...HORARIO_LUNES_A_VIERNES, lun: 10 }).some((a) => a.includes('lunes tiene 10 horas'))).toBe(true);
    expect(avisosHorario({ lun: 6, mar: 6, mie: 6, jue: 6, vie: 6, sab: 6, dom: 6 }).some((a) => a.includes('día libre'))).toBe(true);
  });

  it('valor de la hora: con 44 h coincide con salario ÷ 23.83 ÷ 8', () => {
    const v = valorHoraCents(3_000_000, HORARIO_LUNES_A_SABADO);
    expect(Math.abs(v - 3_000_000 / 23.83 / 8)).toBeLessThan(10); // menos de 10 centavos
    expect(valorHoraCents(3_000_000, { ...HORARIO_LUNES_A_VIERNES, lun: 0, mar: 0, mie: 0, jue: 0, vie: 0 })).toBe(0);
  });

  it('valida la forma del horario', () => {
    expect(esHorario(HORARIO_LUNES_A_SABADO)).toBe(true);
    expect(esHorario({ ...HORARIO_LUNES_A_SABADO, dom: 25 })).toBe(false);
    expect(esHorario({ ...HORARIO_LUNES_A_SABADO, lun: 7.25 })).toBe(false);
    expect(esHorario({ lun: 8 })).toBe(false);
    expect(esHorario(null)).toBe(false);
  });
});
