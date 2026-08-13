import { describe, expect, it } from 'vitest';
import { validarTutoresDeAlta } from '@/lib/administracion-escolar/tutores';

/**
 * El alta de un estudiante exige al menos un tutor.
 *
 * Lo que se prueba es la regla del SERVIDOR, no el formulario: el navegador
 * puede mandar cualquier cosa. El responsable de pago ya no se valida aquí —
 * dejó de ser un tutor marcado y pasó a ser un contacto de Facturación colgado
 * del alumno.
 */
describe('validarTutoresDeAlta', () => {
  const responsable = { tutorId: 1, relacion: 'madre', responsablePago: true };

  it('un alumno sin tutores no se da de alta', () => {
    expect(validarTutoresDeAlta([]).ok).toBe(false);
    expect(validarTutoresDeAlta(undefined).ok).toBe(false);
    expect(validarTutoresDeAlta(null).ok).toBe(false);
    // Un objeto suelto tampoco: no es una lista.
    expect(validarTutoresDeAlta(responsable).ok).toBe(false);
  });

  it('acepta varios tutores', () => {
    const r = validarTutoresDeAlta([
      responsable,
      { tutorId: 2, relacion: 'padre' },
      { tutorId: 3, relacion: 'cuidador' },
    ]);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.tutores).toHaveLength(3);
  });

  it('rechaza el mismo tutor dos veces', () => {
    // Con `onConflictDoUpdate` detrás, el duplicado no reventaría: la segunda
    // fila pisaría a la primera y una relación elegida a mano desaparecería sin
    // decir nada.
    expect(validarTutoresDeAlta([responsable, { tutorId: 1, relacion: 'padre' }]).ok).toBe(false);
  });

  it('rechaza ids que no son ids', () => {
    expect(validarTutoresDeAlta([{ tutorId: 0, responsablePago: true }]).ok).toBe(false);
    expect(validarTutoresDeAlta([{ tutorId: -3, responsablePago: true }]).ok).toBe(false);
    expect(validarTutoresDeAlta([{ tutorId: 'uno', responsablePago: true }]).ok).toBe(false);
    expect(validarTutoresDeAlta([{ relacion: 'padre', responsablePago: true }]).ok).toBe(false);
  });

  it('una relación inventada no tumba el alta: cae en «tutor»', () => {
    // La relación es una etiqueta, no una regla. Rechazar el alta entera por
    // ella sería castigar al usuario por un dato decorativo.
    const r = validarTutoresDeAlta([{ tutorId: 1, relacion: 'abuelo', responsablePago: true }]);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.tutores[0].relacion).toBe('abuelo');
  });

});
