import { describe, it, expect } from 'vitest';
import {
  claveReferencia, compararMonto, detectarDuplicado, limpiarLectura, textoMotivoDuplicado,
  type ParaDuplicado,
} from '@/lib/administracion-escolar/comprobante-lectura';

/**
 * Lo que la IA lee de un comprobante y qué se hace con ello: sanearlo, compararlo
 * con lo que se va a registrar y decidir si es una repetición. La IA propone; lo
 * que aquí se prueba es que su propuesta nunca llega sin pasar por el filtro.
 */

describe('limpiarLectura', () => {
  const buena = {
    esComprobante: true,
    bancoDestino: 'bhd leon',
    bancoOrigen: 'Banco Popular Dominicano',
    cuentaDestino: '****9034',
    monto: 4800,
    fecha: '2026-10-03',
    referencia: '  8422 91A ',
    ordenante: 'Juan Pérez',
    beneficiario: 'Colegio Mi Casita',
    confianza: 0.93,
  };

  it('normaliza el banco al nombre de la lista y pasa los pesos a centavos', () => {
    const l = limpiarLectura(buena, 'google/gemini-2.5-flash-lite');
    expect(l).toMatchObject({
      esComprobante: true,
      bancoDestino: 'Banco BHD',
      bancoOrigen: 'Banco Popular',
      cuentaDestinoUltimos4: '9034',
      montoCentavos: 480000,
      fecha: '2026-10-03',
      referencia: '8422 91A',
      confianza: 0.93,
      modelo: 'google/gemini-2.5-flash-lite',
    });
  });

  it('un banco que no está en la lista se conserva tal cual lo leyó', () => {
    expect(limpiarLectura({ ...buena, bancoDestino: 'Banco Fihogar' }, 'm').bancoDestino).toBe('Banco Fihogar');
  });

  it('redondea el monto al centavo', () => {
    expect(limpiarLectura({ ...buena, monto: 1234.565 }, 'm').montoCentavos).toBe(123457);
    expect(limpiarLectura({ ...buena, monto: 0.1 + 0.2 }, 'm').montoCentavos).toBe(30);
  });

  it('un monto cero, negativo, absurdo o que no es número se descarta', () => {
    for (const monto of [0, -50, Number.NaN, Number.POSITIVE_INFINITY, '4800', null, 5e12]) {
      expect(limpiarLectura({ ...buena, monto }, 'm').montoCentavos).toBeNull();
    }
  });

  it('una fecha que no existe se descarta', () => {
    expect(limpiarLectura({ ...buena, fecha: '2026-02-31' }, 'm').fecha).toBeNull();
    expect(limpiarLectura({ ...buena, fecha: '03/10/2026' }, 'm').fecha).toBeNull();
    expect(limpiarLectura({ ...buena, fecha: null }, 'm').fecha).toBeNull();
  });

  it('la confianza se acota entre 0 y 1', () => {
    expect(limpiarLectura({ ...buena, confianza: 7 }, 'm').confianza).toBe(1);
    expect(limpiarLectura({ ...buena, confianza: -2 }, 'm').confianza).toBe(0);
    expect(limpiarLectura({ ...buena, confianza: 'alta' }, 'm').confianza).toBe(0);
  });

  it('los últimos 4 dígitos solo si hay al menos cuatro', () => {
    expect(limpiarLectura({ ...buena, cuentaDestino: '**1' }, 'm').cuentaDestinoUltimos4).toBeNull();
    expect(limpiarLectura({ ...buena, cuentaDestino: 4821 }, 'm').cuentaDestinoUltimos4).toBe('4821');
  });

  it('textos vacíos o de otro tipo quedan en null', () => {
    const l = limpiarLectura({ ...buena, referencia: '   ', ordenante: 42, beneficiario: {} }, 'm');
    expect(l.referencia).toBeNull();
    expect(l.ordenante).toBeNull();
    expect(l.beneficiario).toBeNull();
  });

  /** Una captura de WhatsApp no tiene banco ni monto: lo «leído» ahí es ruido. */
  it('si no es un comprobante, todo lo demás se descarta', () => {
    const l = limpiarLectura({ ...buena, esComprobante: false }, 'm');
    expect(l.esComprobante).toBe(false);
    expect(l.bancoDestino).toBeNull();
    expect(l.montoCentavos).toBeNull();
    expect(l.referencia).toBeNull();
  });

  it('una salida que no es un objeto no revienta', () => {
    expect(limpiarLectura(null, 'm').montoCentavos).toBeNull();
    expect(limpiarLectura('hola', 'm').bancoDestino).toBeNull();
  });
});

describe('compararMonto', () => {
  it('el mismo monto al centavo coincide', () => {
    expect(compararMonto(480000, 480000)).toEqual({ estado: 'coincide' });
  });

  it('una diferencia, aunque sea de un centavo, se avisa con su signo', () => {
    expect(compararMonto(480000, 500000)).toEqual({ estado: 'difiere', diferenciaCentavos: -20000 });
    expect(compararMonto(500001, 500000)).toEqual({ estado: 'difiere', diferenciaCentavos: 1 });
  });

  it('sin lectura no hay nada que comparar', () => {
    expect(compararMonto(null, 500000)).toEqual({ estado: 'sin_lectura' });
    expect(compararMonto(undefined, 500000)).toEqual({ estado: 'sin_lectura' });
    expect(compararMonto(500000, null)).toEqual({ estado: 'sin_lectura' });
  });
});

describe('claveReferencia', () => {
  it('ignora mayúsculas, espacios y signos', () => {
    expect(claveReferencia('ref: 84-22 91a')).toBe('REF842291A');
    expect(claveReferencia('8422 91A')).toBe('842291A');
  });

  it('menos de cinco caracteres no identifica nada', () => {
    expect(claveReferencia('1234')).toBeNull();
    expect(claveReferencia('')).toBeNull();
    expect(claveReferencia(null)).toBeNull();
  });
});

describe('detectarDuplicado', () => {
  const comp = (id: number, o: Partial<ParaDuplicado> = {}): ParaDuplicado => ({
    id, estado: 'pendiente', clientId: 7, creadoEn: new Date(`2026-10-${10 + id}T15:00:00Z`),
    archivoHash: null, lectura: null, ...o,
  });
  const lec = (o: Partial<NonNullable<ParaDuplicado['lectura']>> = {}) =>
    ({ referencia: null, montoCentavos: null, fecha: null, ...o });

  it('el mismo archivo es duplicado', () => {
    const d = detectarDuplicado(
      comp(2, { archivoHash: 'abc' }),
      [comp(1, { estado: 'aprobado', archivoHash: 'abc' })],
    );
    expect(d).toMatchObject({ id: 1, estado: 'aprobado', motivo: 'archivo' });
  });

  it('la misma referencia del banco es duplicado, aunque la foto sea otra', () => {
    const d = detectarDuplicado(
      comp(2, { archivoHash: 'x', lectura: lec({ referencia: '8422-91A' }) }),
      [comp(1, { archivoHash: 'y', lectura: lec({ referencia: '8422 91a' }) })],
    );
    expect(d).toMatchObject({ id: 1, motivo: 'referencia' });
  });

  it('el mismo monto con la misma fecha es duplicado (señal más débil)', () => {
    const d = detectarDuplicado(
      comp(2, { lectura: lec({ montoCentavos: 480000, fecha: '2026-10-03' }) }),
      [comp(1, { lectura: lec({ montoCentavos: 480000, fecha: '2026-10-03' }) })],
    );
    expect(d).toMatchObject({ id: 1, motivo: 'monto_fecha' });
  });

  it('mismo monto en otra fecha NO lo es', () => {
    expect(detectarDuplicado(
      comp(2, { lectura: lec({ montoCentavos: 480000, fecha: '2026-10-03' }) }),
      [comp(1, { lectura: lec({ montoCentavos: 480000, fecha: '2026-09-03' }) })],
    )).toBeNull();
  });

  it('mismo monto sin fecha legible no basta', () => {
    expect(detectarDuplicado(
      comp(2, { lectura: lec({ montoCentavos: 480000, fecha: null }) }),
      [comp(1, { lectura: lec({ montoCentavos: 480000, fecha: null }) })],
    )).toBeNull();
  });

  /**
   * La referencia de la FILA, si el padre no escribe otra, es la del enlace de
   * pago: la misma en todos los comprobantes de la familia. Por eso solo se
   * compara la que leyó la IA, y dos comprobantes sin lectura no se marcan.
   */
  it('sin lectura ni hash en común no hay duplicado', () => {
    expect(detectarDuplicado(comp(2), [comp(1), comp(3)])).toBeNull();
  });

  it('solo cuenta la MISMA familia', () => {
    expect(detectarDuplicado(
      comp(2, { archivoHash: 'abc' }),
      [comp(1, { clientId: 99, archivoHash: 'abc' })],
    )).toBeNull();
  });

  it('un comprobante sin familia no se compara con nadie', () => {
    expect(detectarDuplicado(
      comp(2, { clientId: null, archivoHash: 'abc' }),
      [comp(1, { clientId: null, archivoHash: 'abc' })],
    )).toBeNull();
  });

  it('uno rechazado no cuenta: nunca movió dinero y volver a subirlo es lo que se le pidió', () => {
    expect(detectarDuplicado(
      comp(2, { archivoHash: 'abc' }),
      [comp(1, { estado: 'rechazado', archivoHash: 'abc' })],
    )).toBeNull();
  });

  it('no se compara consigo mismo', () => {
    const yo = comp(2, { archivoHash: 'abc' });
    expect(detectarDuplicado(yo, [yo])).toBeNull();
  });

  it('también marca contra uno PENDIENTE (aún sin cobrar)', () => {
    const d = detectarDuplicado(
      comp(2, { archivoHash: 'abc' }),
      [comp(1, { estado: 'pendiente', archivoHash: 'abc' })],
    );
    expect(d).toMatchObject({ id: 1, estado: 'pendiente' });
  });

  it('si encajan varios, gana la señal más firme', () => {
    const d = detectarDuplicado(
      comp(5, { archivoHash: 'abc', lectura: lec({ referencia: 'REF-00123', montoCentavos: 100, fecha: '2026-10-01' }) }),
      [
        comp(1, { lectura: lec({ montoCentavos: 100, fecha: '2026-10-01' }) }),
        comp(2, { lectura: lec({ referencia: 'REF00123' }) }),
        comp(3, { archivoHash: 'abc' }),
      ],
    );
    expect(d).toMatchObject({ id: 3, motivo: 'archivo' });
  });

  it('a igual señal, el más viejo: el original, no la copia', () => {
    const d = detectarDuplicado(
      comp(5, { archivoHash: 'abc' }),
      [comp(4, { archivoHash: 'abc' }), comp(2, { archivoHash: 'abc' }), comp(3, { archivoHash: 'abc' })],
    );
    expect(d?.id).toBe(2);
  });

  it('devuelve la fecha como texto ISO, lista para enviarse al navegador', () => {
    const d = detectarDuplicado(
      comp(2, { archivoHash: 'abc' }),
      [comp(1, { archivoHash: 'abc', creadoEn: new Date('2026-10-12T15:00:00Z') })],
    );
    expect(d?.creadoEn).toBe('2026-10-12T15:00:00.000Z');
  });

  it('el motivo se cuenta en palabras', () => {
    expect(textoMotivoDuplicado('archivo')).toMatch(/mismo archivo/);
    expect(textoMotivoDuplicado('referencia')).toMatch(/referencia/);
    expect(textoMotivoDuplicado('monto_fecha')).toMatch(/monto.*fecha/);
  });
});
