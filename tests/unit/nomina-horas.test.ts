import { describe, it, expect } from 'vitest';
import { clasificarHoras, partesDeHoras, semanaDeHorario, totalHorasTexto, validarRegistroHoras, type RegistroHoras } from '@/lib/nomina/horas';
import { HORARIO_LUNES_A_SABADO } from '@/lib/nomina/jornada';
import { construirCorrida, periodoDeCorrida, type EmpleadoParaCorrida } from '@/lib/nomina/corrida';
import { TASAS_NOMINA_2026 } from '@/lib/config/nomina-tasas';

const semana = periodoDeCorrida('semanal', { fechaInicio: '2026-09-07' })!; // lunes 7 a domingo 13
const dia = (fecha: string, horas: number, o: Partial<RegistroHoras> = {}): RegistroHoras => ({ fecha, horas, horasNocturnas: 0, feriado: false, ...o });

describe('clasificarHoras', () => {
  it('hasta 44 a la semana son ordinarias', () => {
    const r = clasificarHoras(['07', '08', '09', '10', '11'].map((d) => dia(`2026-09-${d}`, 8)), 25_000, semana);
    expect(r).toMatchObject({ horas: 40, ordinarias: 40, extra35: 0, extra100: 0, dias: 5 });
    expect(r.brutoCents).toBe(40 * 25_000);
  });

  it('seis días de 9 horas: 44 ordinarias y 10 extra al 35 %', () => {
    const r = clasificarHoras(['07', '08', '09', '10', '11', '12'].map((d) => dia(`2026-09-${d}`, 9)), 25_000, semana);
    expect(r).toMatchObject({ horas: 54, ordinarias: 44, extra35: 10, extra100: 0 });
    expect(r.brutoCents).toBe(44 * 25_000 + 10 * 25_000 * 1.35); // 1,100,000 + 337,500
  });

  it('desde 68 horas la extra es al 100 %', () => {
    const r = clasificarHoras(['07', '08', '09', '10', '11', '12', '13'].map((d) => dia(`2026-09-${d}`, 10)), 10_000, semana);
    expect(r).toMatchObject({ horas: 70, ordinarias: 44, extra35: 24, extra100: 2 });
    expect(r.brutoCents).toBe(Math.round(44 * 10_000 + 24 * 10_000 * 1.35 + 2 * 20_000));
  });

  it('recargo nocturno del 15 % y feriado doble', () => {
    const r = clasificarHoras([dia('2026-09-07', 8, { horasNocturnas: 2 }), dia('2026-09-08', 8, { feriado: true })], 25_000, semana);
    expect(r).toMatchObject({ nocturnas: 2, feriado: 8, ordinarias: 16 });
    expect(r.brutoCents).toBe(16 * 25_000 + 2 * 25_000 * 0.15 + 8 * 25_000);
  });

  it('las horas de la semana antes de la corrida cuentan para el acumulado pero no se pagan', () => {
    // Quincena del 1 al 15: el lunes 31 de agosto y el domingo 30 no son de la corrida,
    // pero las del 31 de agosto sí son de la misma semana que el 1 de septiembre.
    const q1 = periodoDeCorrida('quincenal-1', { periodo: '2026-09' })!;
    const registros = [dia('2026-08-31', 10), dia('2026-09-01', 10), dia('2026-09-02', 10), dia('2026-09-03', 10), dia('2026-09-04', 10)];
    const r = clasificarHoras(registros, 10_000, q1);
    expect(r.horas).toBe(40);          // solo del 1 al 4
    expect(r.ordinarias).toBe(34);     // 44 − las 10 del 31 de agosto
    expect(r.extra35).toBe(6);
  });
});

describe('validarRegistroHoras', () => {
  const hoy = '2026-09-14';
  it('acepta medias horas y nocturnas dentro del día', () => {
    expect(validarRegistroHoras({ fecha: '2026-09-10', horas: '8.5', horasNocturnas: '2' }, hoy, 'empleado')).toMatchObject({ ok: true, datos: { horas: 8.5, horasNocturnas: 2 } });
  });
  it('rechaza días futuros, horas raras y más nocturnas que horas', () => {
    expect(validarRegistroHoras({ fecha: '2026-09-15', horas: 8 }, hoy, 'empleado')).toMatchObject({ ok: false });
    expect(validarRegistroHoras({ fecha: '2026-09-10', horas: 7.25 }, hoy, 'empleado')).toMatchObject({ ok: false });
    expect(validarRegistroHoras({ fecha: '2026-09-10', horas: 25 }, hoy, 'empleado')).toMatchObject({ ok: false });
    expect(validarRegistroHoras({ fecha: '2026-09-10', horas: 4, horasNocturnas: 5 }, hoy, 'empleado')).toMatchObject({ ok: false });
  });
  it('el empleado no carga más de 45 días atrás; la empresa sí', () => {
    expect(validarRegistroHoras({ fecha: '2026-07-01', horas: 8 }, hoy, 'empleado')).toMatchObject({ ok: false });
    expect(validarRegistroHoras({ fecha: '2026-07-01', horas: 8 }, hoy, 'empresa')).toMatchObject({ ok: true });
  });
});

describe('construirCorrida con pago por horas', () => {
  const emp = (o: Partial<EmpleadoParaCorrida> = {}): EmpleadoParaCorrida => ({
    id: 1, nombres: 'Pedro', apellidos: 'Horas', cedula: null, cargo: null, salarioBaseCents: 0, estado: 'activo', ...o,
  });

  it('el bruto son las horas aprobadas y la línea guarda su detalle', () => {
    const horas = clasificarHoras(['07', '08', '09', '10', '11', '12'].map((d) => dia(`2026-09-${d}`, 9)), 25_000, semana);
    const { lineas } = construirCorrida([emp({ pagoPorHoras: horas })], TASAS_NOMINA_2026, semana);
    expect(lineas[0].brutoCents).toBe(1_437_500);
    expect(lineas[0].horasDetalle).toMatchObject({ horas: 54, extra35: 10 });
    expect(lineas[0].diasPagados).toBe(6);
    // Cuadra por dentro: neto = bruto − deducciones.
    expect(lineas[0].netoCents).toBe(lineas[0].brutoCents - lineas[0].totalDeduccionesCents);
  });

  it('sin horas aprobadas no hay línea', () => {
    const vacio = clasificarHoras([], 25_000, semana);
    expect(construirCorrida([emp({ pagoPorHoras: vacio })], TASAS_NOMINA_2026, semana).lineas).toHaveLength(0);
  });

  it('el ISR se calcula a ese ritmo mensual: 54 h semanales a RD$250 exentas', () => {
    // RD$14,375 a la semana → ~RD$62,291 al mes: paga ISR; a RD$100 la hora no.
    const barato = clasificarHoras(['07', '08', '09', '10', '11'].map((d) => dia(`2026-09-${d}`, 8)), 10_000, semana);
    const { lineas } = construirCorrida([emp({ pagoPorHoras: barato, dispensaSalarioMinimo: true })], TASAS_NOMINA_2026, semana);
    expect(lineas[0].isrCents).toBe(0);
  });
});

describe('textos y estimado', () => {
  it('sin extra no nombra las ordinarias', () => {
    const r = clasificarHoras(['07', '08', '09', '10', '11'].map((d) => dia(`2026-09-${d}`, 8)), 25_000, semana);
    expect(totalHorasTexto(r)).toBe('40');
    expect(partesDeHoras(r)).toEqual([]);
  });

  it('con extra, nocturnas y feriado las enseña todas', () => {
    const r = clasificarHoras([
      ...['07', '08', '09', '10', '11'].map((d) => dia(`2026-09-${d}`, 9)),
      dia('2026-09-12', 9.5, { horasNocturnas: 2, feriado: true }),
    ], 25_000, semana);
    expect(totalHorasTexto(r)).toBe('54.5');
    expect(partesDeHoras(r)).toEqual(['44 ordinarias', '10.5 extra al 35 %', '2 nocturnas (+15 %)', '9.5 en feriado (dobles)']);
  });

  it('la semana del horario sale del mismo clasificador', () => {
    const r = semanaDeHorario(HORARIO_LUNES_A_SABADO, 25_000); // 8 × 5 + 4 = 44
    expect(r).toMatchObject({ horas: 44, ordinarias: 44, extra35: 0, dias: 6, brutoCents: 44 * 25_000 });
    const largo = semanaDeHorario({ ...HORARIO_LUNES_A_SABADO, sab: 8 }, 25_000); // 48
    expect(largo).toMatchObject({ ordinarias: 44, extra35: 4 });
    expect(largo.brutoCents).toBe(44 * 25_000 + 4 * 25_000 * 1.35);
  });
});
