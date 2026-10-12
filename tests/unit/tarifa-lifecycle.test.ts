import { describe, it, expect } from 'vitest';
import { objetivoCubreCadena } from '@/lib/administracion-escolar/tarifa-lifecycle';

/**
 * La herencia de tarifas es lo que hace que quitar un precio NO borre cargos que
 * otro nivel sigue sosteniendo. Es la parte con más filo del ciclo de vida —el
 * resto son consultas—, así que se prueba sola: sección → grado → servicio.
 */
describe('objetivoCubreCadena', () => {
  const cadena = { seccionId: 10, gradoId: 5, servicioId: 2 };

  it('el precio de la sección cubre a su matrícula', () => {
    expect(objetivoCubreCadena('seccion', 10, cadena)).toBe(true);
  });

  it('el precio del grado cubre a la sección que cuelga de él', () => {
    expect(objetivoCubreCadena('grado', 5, cadena)).toBe(true);
  });

  it('el precio del servicio cubre a todo lo que cuelga de él', () => {
    expect(objetivoCubreCadena('servicio', 2, cadena)).toBe(true);
  });

  it('un precio de OTRA sección/grado/servicio no la cubre', () => {
    expect(objetivoCubreCadena('seccion', 99, cadena)).toBe(false);
    expect(objetivoCubreCadena('grado', 99, cadena)).toBe(false);
    expect(objetivoCubreCadena('servicio', 99, cadena)).toBe(false);
  });

  it('quitar el precio de la sección deja huérfana solo si el grado/servicio no cubre', () => {
    // Simula `restantes` tras quitar el precio de la sección 10.
    const restantesConGrado = [{ objetivoTipo: 'grado', objetivoId: 5 }];
    const restantesVacio: { objetivoTipo: string; objetivoId: number }[] = [];

    const cubierta = restantesConGrado.some((r) => objetivoCubreCadena(r.objetivoTipo, r.objetivoId, cadena));
    const huerfana = !restantesVacio.some((r) => objetivoCubreCadena(r.objetivoTipo, r.objetivoId, cadena));

    expect(cubierta).toBe(true);   // el precio del grado la sostiene: su cargo no se toca
    expect(huerfana).toBe(true);   // sin ningún precio restante: su cargo sin factura se quita
  });

  it('un objetivo desconocido nunca cubre', () => {
    expect(objetivoCubreCadena('otro', 10, cadena)).toBe(false);
  });
});
