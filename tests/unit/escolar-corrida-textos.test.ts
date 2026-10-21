import { describe, expect, it } from 'vitest';
import {
  fechaCorta,
  fechaLarga,
  redactarAviso,
  textoDeRevision,
  type DatosAvisoCorrida,
} from '@/lib/administracion-escolar/corrida-textos';
import type { ResumenCorrida } from '@/lib/administracion-escolar/corrida-avisos';

/**
 * Qué se le dice al colegio según el aviso y según quién factura.
 *
 * Lo que más importa: que un colegio manual NUNCA lea «Zero generará las
 * facturas» —se quedaría esperando algo que no va a pasar— y que uno automático
 * no lea que le toca a él.
 */

const resumen = (over: Partial<ResumenCorrida> = {}): ResumenCorrida => ({
  familias: 57,
  lineas: 90,
  totalCentavos: 41_250_000,
  porConcepto: [
    { conceptoId: 1, concepto: 'Colegiatura', lineas: 78, totalCentavos: 39_000_000 },
    { conceptoId: 2, concepto: 'Transporte', lineas: 12, totalCentavos: 2_250_000 },
  ],
  facturadasHoy: { facturas: 0, lineas: 0, totalCentavos: 0 },
  sinCargo: { familias: 0, lineas: 0, totalCentavos: 0 },
  yaFacturadas: 0,
  revisar: [],
  ...over,
});

const datos = (over: Partial<DatosAvisoCorrida> = {}): DatosAvisoCorrida => ({
  tipo: 'aviso-5',
  fecha: '2026-10-30',
  modo: 'automatico',
  colegio: 'Colegio Ejemplo',
  resumen: resumen(),
  ...over,
});

describe('fechas en letra', () => {
  it('sale el día de la semana y el mes en español', () => {
    expect(fechaCorta('2026-10-30')).toBe('30 de octubre');
    expect(fechaLarga('2026-10-30')).toBe('viernes 30 de octubre');
    expect(fechaLarga('2026-11-01')).toBe('domingo 1 de noviembre');
  });
});

describe('aviso de 5 días', () => {
  it('el asunto lleva la fecha de emisión', () => {
    expect(redactarAviso(datos()).asunto).toBe('Así va a salir la facturación del 30 de octubre');
  });

  it('automático: dice que Zero genera las facturas a las 3:00 a. m.', () => {
    const r = redactarAviso(datos());
    expect(r.intro).toContain('Zero va a generar solo las facturas');
    expect(r.intro).toContain('3:00 a. m.');
    expect(r.cifras[0]).toEqual({ etiqueta: 'Facturas a generar', valor: '57' });
    expect(r.cifras[1]).toEqual({ etiqueta: 'Total', valor: 'RD$412,500.00' });
  });

  it('manual: es un recordatorio de que le toca facturar a él', () => {
    const r = redactarAviso(datos({ modo: 'manual' }));
    expect(r.intro).toContain('Zero no factura solo');
    expect(r.intro).toContain('te toca facturar');
    expect(r.intro).not.toContain('va a generar solo');
    expect(r.cifras[0]).toEqual({ etiqueta: 'Familias por facturar', valor: '57' });
    expect(r.boton).toEqual({ texto: 'Ir a familias por facturar', destino: 'por-facturar' });
  });

  it('desglosa por concepto con monto en RD$ y separador de miles', () => {
    expect(redactarAviso(datos()).conceptos).toEqual([
      'Colegiatura: 78 cargos, RD$390,000.00',
      'Transporte: 12 cargos, RD$22,500.00',
    ]);
  });

  it('sin nada que revisar lo dice, en vez de dejar la sección vacía', () => {
    const r = redactarAviso(datos());
    expect(r.tituloRevision).toBe('Lo que hay que revisar antes');
    expect(r.revision).toEqual(['Nada por ahora: con los datos de hoy todo está listo para salir.']);
    expect(r.enlace).toBeNull();
  });

  it('ofrece el enlace a Tarifas solo cuando lo que hay que revisar se arregla ahí', () => {
    const conTarifa = redactarAviso(datos({ resumen: resumen({ revisar: [{ codigo: 'sin-producto', cantidad: 3 }] }) }));
    expect(conTarifa.enlace).toEqual({ texto: 'Revisar las tarifas', destino: 'tarifas' });

    const sinTarifa = redactarAviso(datos({ resumen: resumen({ revisar: [{ codigo: 'sin-responsable', cantidad: 3 }] }) }));
    expect(sinTarifa.enlace).toBeNull();
  });
});

describe('aviso de 2 días', () => {
  it('es el corto: sin desglose por concepto ni cifras', () => {
    const r = redactarAviso(datos({ tipo: 'aviso-2' }));
    expect(r.asunto).toBe('Pasado mañana se factura');
    expect(r.conceptos).toEqual([]);
    expect(r.cifras).toEqual([]);
  });

  it('automático y manual dicen cosas distintas', () => {
    const auto = redactarAviso(datos({ tipo: 'aviso-2' }));
    expect(auto.intro).toContain('Zero genera solo 57 facturas');
    expect(auto.intro).toContain('RD$412,500.00');

    const manual = redactarAviso(datos({ tipo: 'aviso-2', modo: 'manual' }));
    expect(manual.intro).toContain('te toca facturar a 57 familias');
    expect(manual.intro).not.toContain('Zero genera solo');
  });

  it('con una sola familia usa el singular', () => {
    const r = redactarAviso(datos({ tipo: 'aviso-2', resumen: resumen({ familias: 1, totalCentavos: 500_000 }) }));
    expect(r.intro).toContain('1 factura de');
  });

  it('si no hay nada que revisar lo dice en una frase y no abre la sección', () => {
    const r = redactarAviso(datos({ tipo: 'aviso-2' }));
    expect(r.intro).toContain('Todo está en orden.');
    expect(r.tituloRevision).toBeNull();
  });

  it('si hay algo que revisar lo lista', () => {
    const r = redactarAviso(datos({ tipo: 'aviso-2', resumen: resumen({ revisar: [{ codigo: 'sin-responsable', cantidad: 2 }] }) }));
    expect(r.intro).not.toContain('Todo está en orden.');
    expect(r.revision).toHaveLength(1);
  });
});

describe('resultado del día', () => {
  const hechas = { facturas: 54, lineas: 80, totalCentavos: 39_820_000 };

  it('el asunto es fijo', () => {
    expect(redactarAviso(datos({ tipo: 'resultado' })).asunto).toBe('Resultado de la facturación de hoy');
  });

  it('automático, todo facturado: el botón lleva a cuentas por cobrar', () => {
    const r = redactarAviso(datos({
      tipo: 'resultado',
      resumen: resumen({ familias: 0, totalCentavos: 0, facturadasHoy: hechas }),
    }));
    expect(r.intro).toContain('Hoy Zero generó 54 facturas');
    expect(r.intro).toContain('RD$398,200.00');
    expect(r.intro).toContain('No quedó ninguna familia por facturar');
    expect(r.boton).toEqual({ texto: 'Ver cuentas por cobrar', destino: 'cuentas-por-cobrar' });
    expect(r.enlace?.destino).toBe('por-facturar');
  });

  it('automático con pendientes: dice cuántas quedaron y manda a facturarlas', () => {
    const r = redactarAviso(datos({
      tipo: 'resultado',
      resumen: resumen({
        familias: 3, totalCentavos: 1_430_000, facturadasHoy: hechas,
        revisar: [{ codigo: 'sin-responsable', cantidad: 3 }],
      }),
    }));
    expect(r.intro).toContain('Quedaron 3 familias sin factura');
    expect(r.boton).toEqual({ texto: 'Ver familias por facturar', destino: 'por-facturar' });
    expect(r.enlace).toEqual({ texto: 'Ver cuentas por cobrar', destino: 'cuentas-por-cobrar' });
    expect(r.cifras.map((c) => c.etiqueta)).toEqual([
      'Facturas creadas hoy', 'Total facturado', 'Familias sin factura', 'Pendiente de facturar',
    ]);
  });

  it('automático sin ninguna factura: lo dice claro', () => {
    const r = redactarAviso(datos({ tipo: 'resultado', resumen: resumen() }));
    expect(r.intro).toContain('Hoy no se generó ninguna factura');
    expect(r.intro).toContain('Quedan 57 familias por facturar');
  });

  it('si ni siquiera existen los cargos de hoy, es lo primero que dice (en los dos modos)', () => {
    const resumenSinCargos = resumen({
      familias: 0, totalCentavos: 0, porConcepto: [],
      sinCargo: { familias: 40, lineas: 55, totalCentavos: 27_500_000 },
      revisar: [{ codigo: 'sin-cargo', cantidad: 55 }],
    });
    for (const modo of ['automatico', 'manual'] as const) {
      const r = redactarAviso(datos({ tipo: 'resultado', modo, resumen: resumenSinCargos }));
      expect(r.intro).toContain('todavía no existen los cargos de 40 familias');
      expect(r.intro).toContain('RD$275,000.00');
      expect(r.boton).toEqual({
        texto: modo === 'automatico' ? 'Ver familias por facturar' : 'Facturar a las familias',
        destino: 'por-facturar',
      });
      expect(r.cifras).toEqual([{ etiqueta: 'Cargos sin generar', valor: '55' }]);
      expect(r.pie).toBe('');
    }
  });

  it('manual: los cargos salieron y las facturas esperan', () => {
    const r = redactarAviso(datos({ tipo: 'resultado', modo: 'manual' }));
    expect(r.intro).toContain('Hoy salió el cobro de Colegio Ejemplo');
    expect(r.intro).toContain('se hacen a mano');
    expect(r.intro).not.toContain('Zero generó');
    expect(r.boton).toEqual({ texto: 'Facturar a las familias', destino: 'por-facturar' });
  });

  it('manual con todo ya facturado a mano', () => {
    const r = redactarAviso(datos({
      tipo: 'resultado', modo: 'manual',
      resumen: resumen({ familias: 0, totalCentavos: 0, facturadasHoy: hechas }),
    }));
    expect(r.intro).toContain('ya está facturado');
    expect(r.boton.destino).toBe('cuentas-por-cobrar');
  });
});

describe('textoDeRevision', () => {
  it('concuerda en singular y plural', () => {
    expect(textoDeRevision({ codigo: 'sin-responsable', cantidad: 1 }))
      .toBe('1 alumno no tiene responsable de pago, así que no hay a quién facturarle.');
    expect(textoDeRevision({ codigo: 'sin-responsable', cantidad: 3 }))
      .toBe('3 alumnos no tienen responsable de pago, así que no hay a quién facturarle.');
    expect(textoDeRevision({ codigo: 'sin-producto', cantidad: 1 })).toContain('saldría con ITBIS exento');
    expect(textoDeRevision({ codigo: 'sin-producto', cantidad: 4 })).toContain('saldrían con ITBIS exento');
  });

  it('el cambio de monto dice de cuánto a cuánto cuando todos cambian igual', () => {
    expect(textoDeRevision({ codigo: 'monto-distinto', cantidad: 14, concepto: 'Colegiatura', de: 450_000, a: 500_000 }))
      .toBe('Colegiatura: 14 cargos cambian de monto respecto a la cuota anterior (de RD$4,500.00 a RD$5,000.00).');
    expect(textoDeRevision({ codigo: 'monto-distinto', cantidad: 1, concepto: 'Transporte' }))
      .toBe('Transporte: 1 cargo cambia de monto respecto a la cuota anterior.');
  });

  it('cubre todos los códigos sin devolver vacío', () => {
    for (const codigo of ['sin-responsable', 'sin-tarifa', 'sin-producto', 'planes', 'monto-distinto', 'sin-saldo', 'sin-cargo', 'sin-factura'] as const) {
      expect(textoDeRevision({ codigo, cantidad: 2, concepto: 'X' }).length).toBeGreaterThan(10);
    }
  });
});

describe('ningún correo lleva el nombre de un alumno', () => {
  it('el texto solo trae cuentas, conceptos y el colegio', () => {
    for (const tipo of ['aviso-5', 'aviso-2', 'resultado'] as const) {
      for (const modo of ['automatico', 'manual'] as const) {
        const r = redactarAviso(datos({
          tipo, modo,
          resumen: resumen({ revisar: [{ codigo: 'sin-responsable', cantidad: 2 }, { codigo: 'monto-distinto', cantidad: 3, concepto: 'Colegiatura' }] }),
        }));
        const todo = JSON.stringify(r);
        // Las únicas palabras propias que entran son las que se le pasaron.
        expect(todo).not.toMatch(/Zahel|Pérez|apellido/i);
      }
    }
  });
});
