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
