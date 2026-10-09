import { describe, it, expect } from 'vitest';
import { TRAMOS, diasDeAtraso, tramoDeAtraso } from '@/lib/administracion-escolar/cartera';

/**
 * La antigüedad de la cartera decide a quién llama el colegio hoy, así que los
 * bordes importan más que el centro: un cargo que vence hoy no es moroso, y uno
 * de 31 días no puede seguir contándose como «1 a 30» cuando la gestión de
 * cobro de ese tramo ya se dio por hecha.
 */
describe('diasDeAtraso', () => {
  it('el día del vencimiento todavía no es atraso', () => {
    expect(diasDeAtraso('2026-08-13', '2026-08-13')).toBe(0);
  });

  it('cuenta los días corridos desde el vencimiento', () => {
    expect(diasDeAtraso('2026-08-01', '2026-08-13')).toBe(12);
  });

  it('el cargo que aún no vence da negativo, no cero', () => {
    // Aplanarlo aquí escondería la diferencia entre «vence hoy» y «vence en
    // tres semanas», que es justo lo que separa la deuda sana de la vencida.
    expect(diasDeAtraso('2026-09-01', '2026-08-13')).toBe(-19);
  });

  it('cruza meses y años sin perder días', () => {
    expect(diasDeAtraso('2025-12-31', '2026-01-01')).toBe(1);
    expect(diasDeAtraso('2026-01-31', '2026-03-01')).toBe(29);
  });

  it('el cambio de horario no mueve la cuenta', () => {
    // En RD no hay horario de verano, pero el servidor puede correr en una zona
    // que sí lo tenga: restando fechas locales, marzo y noviembre desplazan un
    // día entero el atraso de toda la cartera.
    expect(diasDeAtraso('2026-03-07', '2026-03-09')).toBe(2);
    expect(diasDeAtraso('2026-10-31', '2026-11-02')).toBe(2);
  });

  it('sin fecha de vencimiento no hay atraso', () => {
    // El concepto con `diasParaPago = null` no vence nunca. Tratarlo como
    // vencido hoy llenaría el tramo de +90 con deuda que nadie debe tarde.
    expect(diasDeAtraso(null, '2026-08-13')).toBe(0);
    expect(diasDeAtraso(undefined, '2026-08-13')).toBe(0);
  });

  it('una fecha basura no rompe la pantalla', () => {
    expect(diasDeAtraso('mañana', '2026-08-13')).toBe(0);
  });
});

describe('tramoDeAtraso', () => {
  it('lo que no ha vencido va a «por vencer»', () => {
    expect(tramoDeAtraso(0)).toBe('porVencer');
    expect(tramoDeAtraso(-40)).toBe('porVencer');
  });

  it('respeta los bordes de cada tramo', () => {
    expect(tramoDeAtraso(1)).toBe('d1a30');
    expect(tramoDeAtraso(30)).toBe('d1a30');
    expect(tramoDeAtraso(31)).toBe('d31a60');
    expect(tramoDeAtraso(60)).toBe('d31a60');
    expect(tramoDeAtraso(61)).toBe('d61a90');
    expect(tramoDeAtraso(90)).toBe('d61a90');
    expect(tramoDeAtraso(91)).toBe('d90mas');
  });

  it('el tramo viejo no tiene techo', () => {
    expect(tramoDeAtraso(3650)).toBe('d90mas');
  });
});

describe('TRAMOS', () => {
  it('cubre la recta entera sin huecos ni solapes', () => {
    // Si un día alguien mete un tramo nuevo mal encajado, la barra de
    // antigüedad dejaría de sumar el pendiente total y nadie se daría cuenta:
    // el hueco simplemente no se dibuja.
    for (let dias = -5; dias <= 400; dias++) {
      const encajan = TRAMOS.filter((t) =>
        (t.desde === null || dias >= t.desde) && (t.hasta === null || dias <= t.hasta));
      expect(encajan.map((t) => t.key), `día ${dias}`).toHaveLength(1);
    }
  });
});
