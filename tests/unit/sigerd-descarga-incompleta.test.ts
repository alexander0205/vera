import { describe, it, expect } from 'vitest';
import { motivoDescargaIncompleta, type TotalesDescarga } from '@/lib/sigerd/descarga-incompleta';

/**
 * Cuándo una descarga de SIGERD no reemplaza a la guardada. El caso real:
 * CEMM, 26-10 — 12 de 12 secciones con HTTP 500 en el reporte de estudiantes,
 * 0 estudiantes y 0 empleados encima de una descarga con 79 y 19.
 */

const buena: TotalesDescarga = { secciones: 12, estudiantes: 79, empleados: 19, seccionesConError: 0 };

describe('motivoDescargaIncompleta', () => {
  it('la descarga de CEMM del 26-10 no pisa la buena', () => {
    const rota = { secciones: 12, estudiantes: 0, empleados: 0, seccionesConError: 12 };
    expect(motivoDescargaIncompleta(rota, buena)).toBe('SIGERD no devolvió los estudiantes de ninguna de las 12 secciones.');
  });

  it('una sola sección sin leer también la frena: sus alumnos desaparecerían', () => {
    expect(motivoDescargaIncompleta({ ...buena, estudiantes: 70, seccionesConError: 1 }, buena))
      .toBe('SIGERD no devolvió los estudiantes de 1 de 12 secciones.');
  });

  it('cero estudiantes o cero empleados donde había gente', () => {
    expect(motivoDescargaIncompleta({ ...buena, estudiantes: 0 }, buena)).toBe('SIGERD devolvió 0 estudiantes.');
    expect(motivoDescargaIncompleta({ ...buena, empleados: 0 }, buena)).toBe('SIGERD no devolvió el personal del centro.');
  });

  it('una descarga completa pasa, aunque traiga menos alumnos (se fueron)', () => {
    expect(motivoDescargaIncompleta({ ...buena, estudiantes: 75, empleados: 18 }, buena)).toBeNull();
  });

  it('sin descarga anterior solo cuentan las secciones sin leer (quien guarda decide guardarla igual)', () => {
    expect(motivoDescargaIncompleta({ ...buena, estudiantes: 0, empleados: 0 }, null)).toBeNull();
    expect(motivoDescargaIncompleta({ ...buena, seccionesConError: 3 }, null))
      .toBe('SIGERD no devolvió los estudiantes de 3 de 12 secciones.');
  });

  it('un colegio que nunca tuvo personal en SIGERD no se frena por tener cero', () => {
    const sinPersonal = { ...buena, empleados: 0 };
    expect(motivoDescargaIncompleta(sinPersonal, sinPersonal)).toBeNull();
  });
});
