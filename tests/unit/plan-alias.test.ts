import { describe, it, expect } from 'vitest';
import { getPlan } from '@/lib/config/plans';

describe('renombrado de multisucursal → ilimitado', () => {
  it('la clave nueva resuelve', () => {
    expect(getPlan('ilimitado').name).toBe('Ilimitado');
    expect(getPlan('ilimitado').limits.docs).toBe(-1);
  });
  it('la clave VIEJA sigue resolviendo al mismo plan', () => {
    // Es lo que hay hoy en las 22 filas de producción.
    expect(getPlan('multisucursal').key).toBe('ilimitado');
    expect(getPlan('multisucursal').limits.docs).toBe(-1);
    expect(getPlan('multisucursal').limits.users).toBe(8);
  });
  it('el nombre viejo NO resuelve, y por eso hacía falta el alias', () => {
    expect(getPlan('Multi-sucursal').key).toBe('free');
  });
  it('una clave inventada sigue cayendo a Gratis', () => {
    expect(getPlan('loquesea').key).toBe('free');
  });
});
