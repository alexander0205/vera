import { describe, it, expect } from 'vitest';
import { planesDeFamilia, tramoPorEstudiantes } from '@/lib/config/plans';

/**
 * Los tramos de colegio y lo que traen dentro.
 *
 * Esto existe por un desajuste real: los topes decían 150/300/500/800 mientras
 * los avisos de WhatsApp seguían calculados sobre 100/225/400/650. Nada
 * fallaba, nada avisaba — pero el colegio que llenaba su tramo recibía 2
 * avisos por estudiante en vez de 3, y los avisos cuestan dinero de verdad.
 *
 * Un número suelto en un objeto de configuración no se rompe solo: se queda
 * viejo. Estas pruebas son lo que hace que se rompa.
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
   * El candado que faltaba. Si alguien mueve un tramo y no mueve su cuota de
   * avisos, esto se cae aquí y no en la factura de un colegio.
   */
  it('los avisos alcanzan para 3 por estudiante HASTA EL TOPE del tramo', () => {
    for (const p of TRAMOS) {
      expect(p.limits.whatsappMensajes).toBe(p.limits.estudiantes * AVISOS_POR_ESTUDIANTE);
      expect(p.limits.smsMensajes).toBe(p.limits.estudiantes * AVISOS_POR_ESTUDIANTE);
    }
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
    // Un colegio de 400 alumnos emite ~1,000 comprobantes en el mes de
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
