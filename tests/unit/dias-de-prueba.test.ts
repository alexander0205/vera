import { describe, it, expect } from 'vitest';
import { diasDePrueba, PRUEBA } from '@/lib/config/suscripcion';
import { PLANS } from '@/lib/config/plans';

/**
 * Este número lo cuenta STRIPE, no nosotros: se le pasa como
 * `trial_period_days` al crear la suscripción. Lo que se prueba aquí es que
 * todas las pantallas puedan sacar el MISMO valor de un solo sitio — si se
 * separan, la que miente es la pantalla y el cliente se queda fuera antes de
 * lo prometido.
 */
describe('días de prueba por familia', () => {
  it('facturación 15, colegio 30', () => {
    expect(diasDePrueba('ecf')).toBe(15);
    expect(diasDePrueba('colegio')).toBe(30);
  });

  it('el colegio tiene MÁS, y esa es la regla que importa', () => {
    // Lo que se vende en colegio es el ciclo mensual: la mensualidad que se
    // emite sola, la mora que entra el día que toca y los avisos colgados de
    // esas fechas. Con menos de un mes no se ve un ciclo completo.
    expect(diasDePrueba('colegio')).toBeGreaterThan(diasDePrueba('ecf'));
    expect(diasDePrueba('colegio')).toBeGreaterThanOrEqual(30);
  });

  it('una familia desconocida cae al valor de e-CF, no a cero', () => {
    // Cero días sería una prueba que no existe. Ante la duda, la corta.
    expect(diasDePrueba(null)).toBe(PRUEBA.dias);
    expect(diasDePrueba('loquesea')).toBe(PRUEBA.dias);
  });

  it('las dos familias del catálogo tienen su número puesto', () => {
    // Si alguien añade una tercera familia y olvida sus días, aquí se ve: caería
    // silenciosamente a los 15 de e-CF.
    for (const familia of new Set(PLANS.map(p => p.familia))) {
      expect(PRUEBA.diasPorFamilia[familia], `familia ${familia}`).toBeGreaterThan(0);
    }
  });
});
