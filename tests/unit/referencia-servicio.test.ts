import { describe, it, expect } from 'vitest';
import { referenciaServicio } from '@/lib/administracion-escolar/referencia-servicio';

/**
 * La referencia identifica el servicio de facturación con el que se cobra una
 * tarifa. Se arma sola a partir de la estructura, así que cualquier cambio aquí
 * se propaga a productos ya creados: los casos de abajo salen de nombres reales
 * de Sigerd, que es donde aparecen las trampas.
 */
describe('referenciaServicio', () => {
  it('encadena concepto, grado, servicio, tanda y año', () => {
    expect(referenciaServicio({
      concepto: 'Colegiatura', grado: 'Sexto', servicio: 'Primario',
      tanda: 'Matutina', periodo: '2026-2027',
    })).toBe('Colegiatura-Sexto-Primario-Matutina-2026-2027');
  });

  it('omite el grado cuando la tarifa es de todo el servicio', () => {
    // Una tarifa puesta en el servicio la comparten todos sus grados, así que
    // su referencia no puede nombrar a ninguno.
    expect(referenciaServicio({
      concepto: 'Colegiatura', servicio: 'Primario',
      tanda: 'Matutina', periodo: '2026-2027',
    })).toBe('Colegiatura-Primario-Matutina-2026-2027');
  });

  it('conserva el guion del año escolar', () => {
    // El guion es también el separador; si se descartara, "2026-2027" quedaría
    // como "20262027" y la referencia dejaría de leerse.
    const r = referenciaServicio({
      concepto: 'Inscripción', servicio: 'Inicial', tanda: null, periodo: '2026-2027',
    });
    expect(r).toContain('2026-2027');
  });

  it('descarta las aclaraciones entre paréntesis de Sigerd', () => {
    // Sigerd escribe "Primer grado (7mo Nivel Básico)": el paréntesis alarga
    // sin distinguir nada.
    expect(referenciaServicio({
      concepto: 'Colegiatura', grado: 'Primer grado (7mo Nivel Básico)',
      servicio: 'Secundario', tanda: 'Matutina', periodo: '2026-2027',
    })).toBe('Colegiatura-PrimerGrado-Secundario-Matutina-2026-2027');
  });

  it('quita las tildes', () => {
    // La referencia viaja por XML de la DGII, URLs y exportaciones a Excel.
    const r = referenciaServicio({
      concepto: 'Inscripción', servicio: 'Bachillerato Académico',
      tanda: null, periodo: '2026-2027',
    });
    expect(r).not.toMatch(/[áéíóúÁÉÍÓÚñ]/);
  });

  it('recorta los nombres kilométricos', () => {
    // "Bachillerato Académico en Humanidades y Ciencias Sociales" se comería la
    // referencia entera.
    const r = referenciaServicio({
      concepto: 'Colegiatura', grado: 'Cuarto',
      servicio: 'Bachillerato Académico en Humanidades y Ciencias Sociales',
      tanda: 'Matutina', periodo: '2026-2027',
    });
    for (const trozo of r.split('-')) expect(trozo.length).toBeLessThanOrEqual(24);
  });

  it('nombra la sección solo cuando el aula cobra distinto', () => {
    const conSeccion = referenciaServicio({
      concepto: 'Colegiatura', grado: 'Sexto', seccion: 'A',
      servicio: 'Primario', tanda: 'Matutina', periodo: '2026-2027',
    });
    expect(conSeccion).toContain('SeccionA');

    const sinSeccion = referenciaServicio({
      concepto: 'Colegiatura', grado: 'Sexto', seccion: null,
      servicio: 'Primario', tanda: 'Matutina', periodo: '2026-2027',
    });
    expect(sinSeccion).not.toContain('Seccion');
  });

  it('distingue dos servicios homónimos por su tanda', () => {
    // Sin la tanda, el Primario matutino y el vespertino pedirían la misma
    // referencia y uno pisaría al otro.
    const matutina = referenciaServicio({
      concepto: 'Colegiatura', servicio: 'Primario', tanda: 'Matutina', periodo: '2026-2027',
    });
    const vespertina = referenciaServicio({
      concepto: 'Colegiatura', servicio: 'Primario', tanda: 'Vespertina', periodo: '2026-2027',
    });
    expect(matutina).not.toBe(vespertina);
  });
});
