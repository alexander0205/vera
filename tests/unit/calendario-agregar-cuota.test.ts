import { describe, it, expect } from 'vitest';
import { agregarCuota, type CuotaEditable } from '@/lib/administracion-escolar/calendario';

/**
 * «Agregar cuota» en el calendario de un concepto (Alex, 14-oct): los cobros de
 * fechas sueltas —evaluaciones P1, P2, P3— ya se podían editar fila a fila,
 * pero no había forma de añadir una fecha más.
 */
const fila = (etiqueta: string, fechaEmision: string, porcentajeMilesimas: number, cargos = 0, id: number | null = 1): CuotaEditable => ({
  id, numero: 0, etiqueta, mes: Number(fechaEmision.slice(5, 7)), fechaEmision, porcentajeMilesimas, cargos,
});
const ANIO = { fechaInicio: '2026-08-25', fechaFin: '2027-06-30', hoy: '2026-10-14' };
const ok = (r: ReturnType<typeof agregarCuota>) => {
  if ('error' in r) throw new Error(r.error);
  return r.filas;
};

describe('agregarCuota', () => {
  it('tras «Evaluacion P2» viene «Evaluacion P3», un mes después, con el día de emisión', () => {
    const filas = ok(agregarCuota(
      [fila('Evaluacion P1', '2026-10-13', 50000), fila('Evaluacion P2', '2027-01-15', 50000)],
      { ...ANIO, frecuencia: 'trimestral', diaEmision: 5 },
    ));
    expect(filas.map((f) => f.etiqueta)).toEqual(['Evaluacion P1', 'Evaluacion P2', 'Evaluacion P3']);
    expect(filas[2]).toMatchObject({ id: null, fechaEmision: '2027-02-05', mes: 2, numero: 3, cargos: 0 });
  });

  it('si la última no tiene número, sigue la última que sí: tras P3 y «final» viene P4', () => {
    const filas = ok(agregarCuota(
      [fila('Evaluacion P3', '2027-03-15', 50000), fila('Evaluacion final', '2027-05-14', 50000)],
      { ...ANIO, diaEmision: 10 },
    ));
    expect(filas[2].etiqueta).toBe('Evaluacion P4');
  });

  it('el año se vuelve a repartir y sigue sumando 100%', () => {
    const filas = ok(agregarCuota(
      [fila('P1', '2026-10-13', 50000), fila('P2', '2027-01-15', 50000)],
      { ...ANIO, diaEmision: 5 },
    ));
    expect(filas.map((f) => f.porcentajeMilesimas)).toEqual([33334, 33333, 33333]);
    expect(filas.reduce((a, f) => a + f.porcentajeMilesimas, 0)).toBe(100_000);
  });

  it('una cuota ya facturada conserva su parte: solo se reparte lo que falta', () => {
    const filas = ok(agregarCuota(
      [fila('P1', '2026-10-13', 50000, 92), fila('P2', '2027-01-15', 50000)],
      { ...ANIO, diaEmision: 5 },
    ));
    expect(filas[0].porcentajeMilesimas).toBe(50000);
    expect(filas.slice(1).map((f) => f.porcentajeMilesimas)).toEqual([25000, 25000]);
  });

  it('si lo facturado ya es el año entero, no deja agregar', () => {
    const r = agregarCuota([fila('P1', '2026-10-13', 100000, 5)], { ...ANIO, diaEmision: 5 });
    expect('error' in r).toBe(true);
  });

  it('sin filas, la primera nace al arranque del año y se llama «Cuota 1»', () => {
    const filas = ok(agregarCuota([], { ...ANIO, diaEmision: 5 }));
    expect(filas).toEqual([expect.objectContaining({ etiqueta: 'Cuota 1', fechaEmision: '2026-08-25', porcentajeMilesimas: 100000 })]);
  });

  it('no se sale del año escolar', () => {
    const filas = ok(agregarCuota([fila('P1', '2027-06-10', 100000)], { ...ANIO, diaEmision: 5 }));
    expect(filas[1].fechaEmision).toBe('2027-06-30');
  });

  it('con el año completo no repite el último mes: un mensual no gana un segundo «Junio»', () => {
    const r = agregarCuota(
      [fila('Mayo', '2027-05-05', 50000), fila('Junio', '2027-06-05', 50000)],
      { ...ANIO, frecuencia: 'mensual', diaEmision: 5 },
    );
    expect('error' in r && r.error).toMatch(/termina el 30\/06\/2027/);
  });

  it('tampoco repite la fecha si la última ya está en el último día del año', () => {
    const r = agregarCuota([fila('P1', '2027-06-30', 100000)], { ...ANIO, diaEmision: 5 });
    expect('error' in r).toBe(true);
  });

  it('un cobro mensual se llama como su mes', () => {
    const filas = ok(agregarCuota([fila('Junio', '2027-06-05', 100000)], { ...ANIO, fechaFin: '2027-07-31', frecuencia: 'mensual', diaEmision: 5 }));
    expect(filas[1]).toMatchObject({ etiqueta: 'Julio', fechaEmision: '2027-07-05' });
  });

  it('diciembre pasa a enero del año siguiente', () => {
    const filas = ok(agregarCuota([fila('P1', '2026-12-05', 100000)], { ...ANIO, diaEmision: 5 }));
    expect(filas[1].fechaEmision).toBe('2027-01-05');
  });
});
