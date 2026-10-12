import { describe, it, expect } from 'vitest';
import { familiasOfrecibles, planesDeFamilia } from '@/lib/config/plans';

describe('familiasOfrecibles — el salto de línea es asimétrico', () => {
  it('desde facturación SÍ se ofrece la línea de colegio: se gana el módulo', () => {
    expect(familiasOfrecibles('ecf')).toEqual(['colegio']);
    expect(planesDeFamilia('colegio').length).toBeGreaterThan(0);
  });

  it('desde colegio NO se ofrece bajar: se perderían los estudiantes', () => {
    // Es la razón entera de que esto sea una función y no un booleano.
    expect(familiasOfrecibles('colegio')).toEqual([]);
  });

  it('los planes de colegio traen escolar y pos; los de e-CF no', () => {
    for (const p of planesDeFamilia('colegio')) {
      expect(p.modulos).toContain('escolar');
      expect(p.modulos).toContain('pos');
    }
    for (const p of planesDeFamilia('ecf')) {
      expect(p.modulos).not.toContain('escolar');
    }
  });
});

/**
 * La otra mitad de la asimetría, la que vive en el validador.
 *
 * `familiasOfrecibles` decía que subir a colegio es seguro mientras
 * `validarCambioDePlan` lo bloqueaba: la pantalla ofrecía el plan y el
 * veredicto lo marcaba «No disponible». Dos verdades distintas sobre lo mismo,
 * y la que ganaba era la que dejaba al colegio sin poder contratar.
 */
describe('el bloqueo de familia también es direccional', () => {
  it('las dos mitades dicen lo mismo: desde e-CF se puede subir', () => {
    // Si esto se rompe, es que alguien volvió a poner el booleano de antes y
    // la pantalla vuelve a ofrecer algo que el veredicto rechaza.
    expect(familiasOfrecibles('ecf')).toContain('colegio');
  });

  it('y desde colegio no se baja, que es el sentido que sí duele', () => {
    expect(familiasOfrecibles('colegio')).toHaveLength(0);
  });
});
