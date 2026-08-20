import { describe, it, expect } from 'vitest';
import {
  cuantasCuotas, generarCalendario, recortarDiaAlMes, repartirMilesimas, vencimientoDe,
} from '@/lib/administracion-escolar/calendario';

/**
 * El calendario de cobro es lo que decide cuánto se le factura a cada familia y
 * qué día. Un error aquí no da error: da un año escolar con una cuota de más o
 * de menos, o una factura que sale el 1 de marzo cuando debía salir en febrero,
 * y nadie lo nota hasta cerrar la cartera.
 */

describe('recortarDiaAlMes', () => {
  it('deja el día tal cual cuando el mes lo tiene', () => {
    expect(recortarDiaAlMes(2026, 9, 28)).toBe(28);
  });

  it('recorta al último día en los meses cortos, sin correrse al siguiente', () => {
    expect(recortarDiaAlMes(2026, 2, 30)).toBe(28);
    expect(recortarDiaAlMes(2026, 4, 30)).toBe(30);
  });

  it('sabe de bisiestos', () => {
    expect(recortarDiaAlMes(2028, 2, 30)).toBe(29);
  });

  it('no admite el 31 aunque lo pidan: el tope es 30', () => {
    expect(recortarDiaAlMes(2026, 1, 31)).toBe(30);
  });
});

describe('vencimientoDe', () => {
  it('con cero días para pagar, vence el mismo día que se emite', () => {
    // Es el caso del colegio que ya está en la base: `dias_para_pago = 0`.
    expect(vencimientoDe('2026-09-28', 0)).toBe('2026-09-28');
  });

  it('sin días para pagar (null) NO vence nunca', () => {
    // `null` es lo que deja el interruptor "Tiene fecha de vencimiento"
    // apagado, y significa "se puede pagar cuando sea".
    //
    // Esta prueba antes afirmaba lo contrario —que null vencía el mismo día—
    // y con eso dejaba clavado el fallo: el colegio apagaba el vencimiento y el
    // cargo nacía venciendo hoy. Con mora activada habría empezado a acumular
    // recargo al día siguiente de crearse.
    expect(vencimientoDe('2026-09-28', null)).toBeNull();
  });

  it('cruza el fin de mes y el fin de año', () => {
    expect(vencimientoDe('2026-09-28', 5)).toBe('2026-10-03');
    expect(vencimientoDe('2026-12-28', 10)).toBe('2027-01-07');
  });
});

describe('repartirMilesimas', () => {
  it('siempre suma el 100%, se parta como se parta', () => {
    for (const n of [1, 2, 3, 7, 10, 11, 12]) {
      expect(repartirMilesimas(n).reduce((a, b) => a + b, 0)).toBe(100_000);
    }
  });

  it('el sobrante del truncamiento va a la primera cuota', () => {
    expect(repartirMilesimas(3)).toEqual([33_334, 33_333, 33_333]);
  });
});

describe('generarCalendario', () => {
  const AGOSTO_A_JUNIO = { fechaInicio: '2026-08-01', fechaFin: '2027-06-30' };

  it('un año de agosto a junio da ONCE mensualidades, no doce', () => {
    const cuotas = generarCalendario({ frecuencia: 'mensual', diaEmision: 28, ...AGOSTO_A_JUNIO });
    expect(cuotas).toHaveLength(11);
    expect(cuotas[0].fechaEmision).toBe('2026-08-28');
    expect(cuotas[10].fechaEmision).toBe('2027-06-28');
    expect(cuantasCuotas('mensual', AGOSTO_A_JUNIO.fechaInicio, AGOSTO_A_JUNIO.fechaFin)).toBe(11);
  });

  it('etiqueta las mensualidades con su mes, que es lo que el padre reconoce', () => {
    const cuotas = generarCalendario({ frecuencia: 'mensual', diaEmision: 5, ...AGOSTO_A_JUNIO });
    expect(cuotas[0].etiqueta).toBe('Agosto');
    expect(cuotas[6].etiqueta).toBe('Febrero');
    expect(cuotas[6].mes).toBe(2);
  });

  it('recorta febrero al emitir el 30', () => {
    const cuotas = generarCalendario({ frecuencia: 'mensual', diaEmision: 30, ...AGOSTO_A_JUNIO });
    const febrero = cuotas.find((c) => c.mes === 2);
    expect(febrero?.fechaEmision).toBe('2027-02-28');
  });

  it('el trimestre salta de tres en tres y el semestre de seis en seis', () => {
    const tri = generarCalendario({ frecuencia: 'trimestral', diaEmision: 5, ...AGOSTO_A_JUNIO });
    expect(tri.map((c) => c.fechaEmision))
      .toEqual(['2026-08-05', '2026-11-05', '2027-02-05', '2027-05-05']);
    expect(tri[0].etiqueta).toBe('1er trimestre');

    const sem = generarCalendario({ frecuencia: 'semestral', diaEmision: 5, ...AGOSTO_A_JUNIO });
    expect(sem.map((c) => c.fechaEmision)).toEqual(['2026-08-05', '2027-02-05']);
  });

  it('el pago único es una sola cuota, sin mes', () => {
    const cuotas = generarCalendario({ frecuencia: 'unico', diaEmision: 15, ...AGOSTO_A_JUNIO });
    expect(cuotas).toHaveLength(1);
    expect(cuotas[0].mes).toBeNull();
    expect(cuotas[0].porcentajeMilesimas).toBe(100_000);
  });

  it('el pago único ignora el día del mes y se ancla al arranque del año', () => {
    // El día del mes ordena un cobro que se repite. Aplicárselo al pago único
    // lo sacaba del año: con el año desde el 30 de septiembre y el día 1, la
    // inscripción salía el 1 de septiembre, antes de que el año exista.
    const tarde = { fechaInicio: '2026-09-30', fechaFin: '2027-06-30' };
    expect(generarCalendario({ frecuencia: 'unico', diaEmision: 1, ...tarde })[0].fechaEmision)
      .toBe('2026-09-30');
    // Y da igual qué día se pida: el ancla es la misma.
    expect(generarCalendario({ frecuencia: 'unico', diaEmision: 28, ...tarde })[0].fechaEmision)
      .toBe('2026-09-30');
  });

  it('la cuota del pago único se llama como el concepto', () => {
    const conNombre = generarCalendario({
      frecuencia: 'unico', diaEmision: 1, nombre: 'Inscripción', ...AGOSTO_A_JUNIO,
    });
    expect(conNombre[0].etiqueta).toBe('Inscripción');
    // Sin nombre queda el genérico: es la etiqueta de un concepto recién
    // creado, que todavía no se llama nada.
    expect(generarCalendario({ frecuencia: 'unico', diaEmision: 1, ...AGOSTO_A_JUNIO })[0].etiqueta)
      .toBe('Pago único');
  });

  it('el reparto de cualquier frecuencia suma el año completo', () => {
    for (const frecuencia of ['unico', 'mensual', 'trimestral', 'semestral'] as const) {
      const suma = generarCalendario({ frecuencia, diaEmision: 5, ...AGOSTO_A_JUNIO })
        .reduce((a, c) => a + c.porcentajeMilesimas, 0);
      expect(suma).toBe(100_000);
    }
  });

  it('sin fechas del año escolar no inventa un calendario', () => {
    expect(generarCalendario({ frecuencia: 'mensual', diaEmision: 5, fechaInicio: null, fechaFin: null }))
      .toEqual([]);
  });
});
