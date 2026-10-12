import { describe, it, expect } from 'vitest';
import { vetoDeClase, type CambioDeClase } from '@/lib/contabilidad/clase-cuenta';

/** Una cuenta de gasto creada por error como activo: el caso que esto arregla. */
const base: CambioDeClase = {
  tipoActual: 'activo', tipoNuevo: 'gasto',
  naturalezaActual: 'deudora', naturalezaNueva: 'deudora',
  conMovimientos: true, ejercicioCerrado: null,
};

describe('qué se puede cambiar de una cuenta con apuntes encima', () => {
  it('corregir la clase sí: los asientos no se mueven, solo cambia el reporte', () => {
    expect(vetoDeClase(base)).toBeNull();
  });

  it('sin apuntes no se veta nada, ni dar la vuelta a la naturaleza', () => {
    expect(vetoDeClase({ ...base, conMovimientos: false, naturalezaNueva: 'acreedora' })).toBeNull();
  });

  it('invertir la naturaleza con apuntes no: le cambiaría el signo a todo el histórico', () => {
    expect(vetoDeClase({ ...base, naturalezaNueva: 'acreedora' })).toBe('naturaleza-invertida');
  });

  it('la naturaleza manda sobre el ejercicio cerrado: se avisa de lo más grave', () => {
    expect(vetoDeClase({ ...base, naturalezaNueva: 'acreedora', ejercicioCerrado: 2025 }))
      .toBe('naturaleza-invertida');
  });

  it('con un ejercicio cerrado encima, la clase se queda como se declaró', () => {
    expect(vetoDeClase({ ...base, ejercicioCerrado: 2025 })).toBe('ejercicio-cerrado');
  });

  it('guardar sin cambiar ni clase ni naturaleza nunca se veta', () => {
    // Es lo que pasa al editar solo el nombre de una cuenta de un año cerrado.
    expect(vetoDeClase({ ...base, tipoNuevo: 'activo', ejercicioCerrado: 2025 })).toBeNull();
  });

  it('una cuenta de contrapartida no se puede reclasificar sin invertirla', () => {
    // Depreciación acumulada: activo con naturaleza acreedora. Pasarla a gasto
    // arrastraría la naturaleza a deudora, y eso ya es otra cuenta.
    expect(vetoDeClase({
      tipoActual: 'activo', tipoNuevo: 'gasto',
      naturalezaActual: 'acreedora', naturalezaNueva: 'deudora',
      conMovimientos: true, ejercicioCerrado: null,
    })).toBe('naturaleza-invertida');
  });
});
