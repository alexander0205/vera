import { describe, it, expect } from 'vitest';
import { planesDeFamilia, tramoPorEstudiantes } from '@/lib/config/plans';

/**
 * Los tramos de colegio y lo que traen dentro.
 *
 * Un número suelto en un objeto de configuración no se rompe solo: se queda
 * viejo. Estas pruebas son lo que hace que se rompa.
 *
 * Sobre los avisos de WhatsApp: NO están calculados sobre el techo del tramo
 * sino sobre el colegio típico de cada banda —100, 225, 400 y 650—, a tres por
 * estudiante al mes. Es una decisión de precio tomada a conciencia, no un
 * descuido, así que aquí no se exige que cubran el techo: se exige que la
 * cobertura real siga siendo la que alguien decidió, para que si un día se
 * mueve un tramo alguien vuelva a mirar este número.
 */

const TRAMOS = planesDeFamilia('colegio');

/** La factura, el recordatorio y el vencido. */
const AVISOS_POR_ESTUDIANTE = 3;

describe('tramos de colegio', () => {
  it('son cuatro y van de menos a más', () => {
    expect(TRAMOS.map(p => p.key)).toEqual([
      'colegio-basico', 'colegio-intermedio', 'colegio-avanzado', 'colegio-institucional',
    ]);
    const topes = TRAMOS.map(p => p.limits.estudiantes);
    expect(topes).toEqual([...topes].sort((a, b) => a - b));
    expect(new Set(topes).size).toBe(topes.length);
  });

  /**
   * El colegio TÍPICO sobre el que se dimensionó cada cuota. Si alguien mueve
   * un tramo sin volver a mirar los avisos, esto se cae aquí y no en la
   * factura de WhatsApp a fin de mes.
   */
  const TIPICO: Record<string, number> = {
    'colegio-basico': 100, 'colegio-intermedio': 225,
    'colegio-avanzado': 400, 'colegio-institucional': 650,
  };

  it('los avisos dan 3 por estudiante al colegio típico de cada banda', () => {
    for (const p of TRAMOS) {
      expect(p.limits.whatsappMensajes).toBe(TIPICO[p.key] * AVISOS_POR_ESTUDIANTE);
      expect(p.limits.smsMensajes).toBe(p.limits.whatsappMensajes);
    }
  });

  /**
   * Y lo que eso significa para quien llena su tramo, escrito con número
   * porque es la pregunta que va a llegar por soporte: «pagué el Básico de 150
   * y me quedé sin mensajes». Son 2 por estudiante, no 3. Está asumido.
   */
  it('el colegio que llena su tramo recibe entre 2 y 2.5 avisos por estudiante', () => {
    for (const p of TRAMOS) {
      const enElTecho = p.limits.whatsappMensajes / p.limits.estudiantes;
      expect(enElTecho).toBeGreaterThanOrEqual(2);
      expect(enElTecho).toBeLessThan(AVISOS_POR_ESTUDIANTE);
    }
  });

  it('el típico de cada banda cae dentro de su propia banda', () => {
    TRAMOS.forEach((p, i) => {
      const piso = i === 0 ? 1 : TRAMOS[i - 1].limits.estudiantes + 1;
      expect(TIPICO[p.key]).toBeGreaterThanOrEqual(piso);
      expect(TIPICO[p.key]).toBeLessThanOrEqual(p.limits.estudiantes);
    });
  });

  it('lo que se le enseña al cliente dice el mismo número que se aplica', () => {
    for (const p of TRAMOS) {
      const tope = String(p.limits.estudiantes);
      expect(p.ui.description, `${p.key}: la descripción no cita su tope`).toContain(tope);
      expect(p.ui.marketingFeatures[0]).toBe(`Hasta ${tope} estudiantes`);
    }
  });

  /** Cada tramo arranca donde acaba el anterior: sin huecos ni solapes. */
  it('las bandas son continuas', () => {
    for (let i = 1; i < TRAMOS.length; i++) {
      const anterior = TRAMOS[i - 1].limits.estudiantes;
      expect(TRAMOS[i].ui.description).toBe(
        `De ${anterior + 1} a ${TRAMOS[i].limits.estudiantes} estudiantes`,
      );
    }
  });

  it('e-CF sin tope en los cuatro', () => {
    // Un colegio de 441 alumnos emite ~1,000 comprobantes en el mes de
    // inscripción; cualquier tope lo dejaría sin facturar.
    for (const p of TRAMOS) expect(p.limits.docs).toBe(-1);
  });

  it('el precio sube con el tramo, pero el precio POR ESTUDIANTE baja', () => {
    const porEstudiante = TRAMOS.map(p => p.price / p.limits.estudiantes);
    for (let i = 1; i < TRAMOS.length; i++) {
      expect(TRAMOS[i].price).toBeGreaterThan(TRAMOS[i - 1].price);
      expect(porEstudiante[i]).toBeLessThan(porEstudiante[i - 1]);
    }
  });
});

describe('a qué tramo cae un colegio', () => {
  it('el tope es inclusivo y el siguiente empieza en el número de después', () => {
    for (let i = 0; i < TRAMOS.length; i++) {
      const tope = TRAMOS[i].limits.estudiantes;
      expect(tramoPorEstudiantes(tope)?.key).toBe(TRAMOS[i].key);
      const siguiente = TRAMOS[i + 1];
      if (siguiente) expect(tramoPorEstudiantes(tope + 1)?.key).toBe(siguiente.key);
    }
  });

  it('el colegio de un solo estudiante cae en el más bajo', () => {
    expect(tramoPorEstudiantes(1)?.key).toBe('colegio-basico');
  });

  /**
   * Por encima del tramo mayor NO hay plan: se cotiza hablando. Devolver el
   * más caro calladamente sería cobrarle de menos a un colegio de 2,000.
   */
  it('quien se pasa del mayor no tiene plan de catálogo', () => {
    const mayor = TRAMOS[TRAMOS.length - 1].limits.estudiantes;
    expect(tramoPorEstudiantes(mayor + 1)).toBeNull();
    expect(tramoPorEstudiantes(5000)).toBeNull();
  });
});
