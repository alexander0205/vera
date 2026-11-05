import { describe, it, expect } from 'vitest';
import {
  leerFecha, leerMonto, leerCsv, ordenDeFechas, interpretarExtracto, huellasDeFilas, emparejar,
  ExtractoError, type LineaExtractoPorEmparejar, type LineaLibroPorEmparejar,
} from '@/lib/contabilidad/extracto';

describe('leerFecha', () => {
  it('lee día/mes/año, ISO, Date de Excel y número de serie', () => {
    expect(leerFecha('03/11/2026')).toBe('2026-11-03');
    expect(leerFecha('3-11-26')).toBe('2026-11-03');
    expect(leerFecha('2026-11-03')).toBe('2026-11-03');
    expect(leerFecha('2026-11-03 14:20:00')).toBe('2026-11-03');
    expect(leerFecha(new Date(Date.UTC(2026, 10, 3)))).toBe('2026-11-03');
    expect(leerFecha(46329)).toBe('2026-11-03');
  });
  it('rechaza fechas que no existen o no se entienden', () => {
    expect(leerFecha('31/02/2026')).toBeNull();
    expect(leerFecha('13/13/2026')).toBeNull();
    expect(leerFecha('Total')).toBeNull();
    expect(leerFecha('')).toBeNull();
    expect(leerFecha(12)).toBeNull();
  });
});

describe('leerMonto', () => {
  it('lee los formatos que traen los bancos', () => {
    expect(leerMonto('1,234.56')).toBe(123_456);
    expect(leerMonto('1.234,56')).toBe(123_456);
    expect(leerMonto('RD$ 4,800.00')).toBe(480_000);
    expect(leerMonto('1,500')).toBe(150_000);
    expect(leerMonto('12,50')).toBe(1_250);
    expect(leerMonto('500')).toBe(50_000);
    expect(leerMonto(480.5)).toBe(48_050);
  });
  it('lee negativos de tres maneras', () => {
    expect(leerMonto('-500.00')).toBe(-50_000);
    expect(leerMonto('(500.00)')).toBe(-50_000);
    expect(leerMonto('500.00-')).toBe(-50_000);
  });
  it('no adivina lo dudoso', () => {
    expect(leerMonto('12.345,678')).toBeNull();
    expect(leerMonto('abc')).toBeNull();
    expect(leerMonto('')).toBeNull();
    expect(leerMonto('1.2.3')).toBeNull();
    expect(leerMonto(NaN)).toBeNull();
  });
});

describe('leerCsv', () => {
  it('detecta el delimitador, respeta comillas y el BOM', () => {
    const m = leerCsv('﻿Fecha;Descripción;Monto\r\n03/11/2026;"Pago; con ""comillas""";1.500,00\r\n');
    expect(m).toEqual([['Fecha', 'Descripción', 'Monto'], ['03/11/2026', 'Pago; con "comillas"', '1.500,00']]);
  });
  it('salta las líneas en blanco', () => {
    expect(leerCsv('a,b\n\n1,2\n')).toEqual([['a', 'b'], ['1', '2']]);
  });
});

describe('lectura tolerante del archivo', () => {
  it('«0.500» es 0.50 y no 500; «1.500» sigue siendo mil quinientos', () => {
    expect(leerMonto('0.500')).toBe(50);
    expect(leerMonto('0,500')).toBe(50);
    expect(leerMonto('1.500')).toBe(150_000);
    expect(leerMonto('0.505')).toBeNull();
  });
  it('reconoce encabezados por «contiene» y sin acentos', () => {
    const r = interpretarExtracto([
      ['Fecha de la operación', 'Detalle de la operación', 'Débito (RD$)', 'CRÉDITO (RD$)', 'Número de referencia bancaria'],
      ['03/11/2026', 'x', '10.00', '', 'AB123456'],
    ]);
    expect(r.filas[0]).toMatchObject({ fecha: '2026-11-03', montoCents: -1000, referencia: 'AB123456' });
  });
  it('si alguna fecha trae el día mayor de 12 en segunda posición, todo el archivo es mes/día', () => {
    const r = interpretarExtracto([['Fecha', 'Monto'], ['11/03/2026', '5.00'], ['11/25/2026', '6.00']]);
    expect(r.filas.map((f) => f.fecha)).toEqual(['2026-11-03', '2026-11-25']);
    expect(ordenDeFechas(['25/11/2026', '03/11/2026'])).toBe('dmy');
    expect(ordenDeFechas(['03/11/2026'])).toBe('dmy');
  });
});

describe('interpretarExtracto', () => {
  const conDebitoCredito = [
    ['Banco X', 'Cuenta 000-0000'],
    [],
    ['Fecha', 'Descripción', 'Referencia', 'Débito', 'Crédito', 'Balance'],
    ['02/11/2026', 'Transferencia a proveedor', 'R-10025', '4,800.00', '', '95,200.00'],
    ['03/11/2026', 'Depósito', '88877', '', '1,500.00', '96,700.00'],
    ['Total', '', '', '4,800.00', '1,500.00', ''],
  ];

  it('encuentra el encabezado debajo de los datos de la cuenta y da signo al monto', () => {
    const r = interpretarExtracto(conDebitoCredito);
    expect(r.filas).toHaveLength(2);
    expect(r.filas[0]).toMatchObject({ fecha: '2026-11-02', montoCents: -480_000, referencia: 'R-10025', saldoCents: 9_520_000 });
    expect(r.filas[1]).toMatchObject({ fecha: '2026-11-03', montoCents: 150_000 });
    // La fila de totales no es un movimiento ni un error.
    expect(r.errores).toEqual([]);
  });

  it('una sola columna de monto con signo, o con columna de tipo', () => {
    const a = interpretarExtracto([['Fecha', 'Concepto', 'Monto'], ['01/11/2026', 'x', '-100.00'], ['02/11/2026', 'y', '250.00']]);
    expect(a.filas.map((f) => f.montoCents)).toEqual([-10_000, 25_000]);
    const b = interpretarExtracto([['Fecha', 'Detalle', 'Monto', 'Tipo'], ['01/11/2026', 'x', '100.00', 'Débito'], ['02/11/2026', 'y', '250.00', 'Crédito']]);
    expect(b.filas.map((f) => f.montoCents)).toEqual([-10_000, 25_000]);
  });

  it('reporta las filas con fecha o monto ilegibles con su número de fila', () => {
    const r = interpretarExtracto([['Fecha', 'Monto'], ['31/02/2026', '10.00'], ['01/11/2026', 'abc'], ['01/11/2026', '5.00']]);
    expect(r.filas).toHaveLength(1);
    expect(r.errores.map((e) => e.fila)).toEqual([2, 3]);
  });

  it('falla claro si no hay columnas de fecha y monto, o si no hay movimientos', () => {
    expect(() => interpretarExtracto([['Nombre', 'Edad'], ['Ana', '3']])).toThrow(ExtractoError);
    expect(() => interpretarExtracto([['Fecha', 'Monto']])).toThrow(/no trae movimientos/);
  });

  it('descarta las líneas sin importe', () => {
    const r = interpretarExtracto([['Fecha', 'Débito', 'Crédito'], ['01/11/2026', '', ''], ['02/11/2026', '', '10.00']]);
    expect(r.filas).toHaveLength(1);
  });
});

describe('huellasDeFilas', () => {
  const f = { fecha: '2026-11-03', montoCents: 5_000, referencia: 'A1', descripcion: 'Pago' };
  it('dos líneas idénticas del mismo archivo tienen huellas distintas', () => {
    const h = huellasDeFilas(7, [{ fila: 1, saldoCents: null, ...f }, { fila: 2, saldoCents: null, ...f }]);
    expect(new Set(h).size).toBe(2);
  });
  it('un tramo que se traslapa con otro reproduce las mismas huellas', () => {
    const uno = huellasDeFilas(7, [{ fila: 1, saldoCents: null, ...f }, { fila: 2, saldoCents: null, ...f }]);
    const otro = huellasDeFilas(7, [{ fila: 9, saldoCents: null, ...f }, { fila: 10, saldoCents: null, ...f }]);
    expect(otro).toEqual(uno);
  });
  it('depende de la cuenta', () => {
    expect(huellasDeFilas(7, [{ fila: 1, saldoCents: null, ...f }])).not.toEqual(huellasDeFilas(8, [{ fila: 1, saldoCents: null, ...f }]));
  });
});

describe('emparejar extracto con libro', () => {
  const e = (id: number, fecha: string, montoCents: number, referencia: string | null = null): LineaExtractoPorEmparejar =>
    ({ id, fecha, montoCents, referencia, descripcion: null });
  const l = (id: number, fecha: string, montoCents: number, texto = ''): LineaLibroPorEmparejar => ({ id, fecha, montoCents, texto });

  it('empareja por monto y fecha cuando hay un solo candidato', () => {
    const r = emparejar([e(1, '2026-11-03', -480_000)], [l(10, '2026-11-02', -480_000, 'Pago proveedor')]);
    expect(r.pares).toEqual([{ extractoId: 1, libroId: 10, motivo: 'monto-fecha' }]);
  });

  it('nunca empareja montos distintos, ni signos opuestos', () => {
    expect(emparejar([e(1, '2026-11-03', -480_000)], [l(10, '2026-11-03', -480_001)]).pares).toEqual([]);
    expect(emparejar([e(1, '2026-11-03', 480_000)], [l(10, '2026-11-03', -480_000)]).pares).toEqual([]);
  });

  it('no empareja si la fecha está lejos', () => {
    expect(emparejar([e(1, '2026-12-31', 100)], [l(10, '2026-11-01', 100)]).pares).toEqual([]);
    // Entre 7 y 45 días solo se SUGIERE: nunca se une sola.
    const r = emparejar([e(1, '2026-11-20', 100)], [l(10, '2026-11-01', 100)]);
    expect(r.pares).toEqual([]);
    expect(r.sugeridas).toEqual([{ extractoId: 1, candidatos: [10] }]);
    expect(emparejar([e(1, '2026-11-08', 100)], [l(10, '2026-11-01', 100)]).pares).toHaveLength(1);
  });

  it('la referencia desempata entre dos apuntes del mismo monto', () => {
    const r = emparejar(
      [e(1, '2026-11-03', -50_000, 'R-777123')],
      [l(10, '2026-11-03', -50_000, 'Pago a proveedor A ref A-1'), l(11, '2026-11-03', -50_000, 'Pago a proveedor B ref R-777123')],
    );
    expect(r.pares).toEqual([{ extractoId: 1, libroId: 11, motivo: 'referencia' }]);
  });

  it('un apunte del libro se usa una sola vez', () => {
    const r = emparejar(
      [e(1, '2026-11-03', 100), e(2, '2026-11-03', 100)],
      [l(10, '2026-11-03', 100)],
    );
    // Dos líneas del banco compiten por un apunte: ninguna se une sola.
    expect(r.pares).toEqual([]);
    expect(r.ambiguas.map((a) => a.extractoId).sort()).toEqual([1, 2]);
  });

  it('la regla por referencia también respeta la ventana de 7 días', () => {
    const lejos = emparejar([e(1, '2026-11-20', -50_000, 'R-777123')], [l(10, '2026-11-03', -50_000, 'ref R-777123')]);
    expect(lejos.pares).toEqual([]);
    expect(lejos.sugeridas).toHaveLength(1);
  });

  it('una referencia de menos de 6 caracteres no pesa', () => {
    const r = emparejar([e(1, '2026-11-03', 100, 'R-77')], [l(10, '2026-11-03', 100, 'x R-77'), l(11, '2026-11-03', 100, 'y')]);
    expect(r.pares.every((p) => p.motivo === 'monto-fecha')).toBe(true);
  });

  it('con dos candidatos a distinta distancia elige el más cercano', () => {
    const r = emparejar([e(1, '2026-11-05', 100)], [l(10, '2026-11-04', 100), l(11, '2026-11-01', 100)]);
    expect(r.pares).toEqual([{ extractoId: 1, libroId: 10, motivo: 'monto-fecha' }]);
  });

  it('con candidatos igual de cercanos y en fechas distintas no adivina: queda ambigua', () => {
    const r = emparejar([e(1, '2026-11-05', 100)], [l(10, '2026-11-04', 100), l(11, '2026-11-06', 100)]);
    expect(r.pares).toEqual([]);
    expect(r.ambiguas).toEqual([{ extractoId: 1, candidatos: [10, 11] }]);
  });

  it('varios movimientos idénticos el mismo día se emparejan uno a uno', () => {
    const r = emparejar(
      [e(1, '2026-11-03', 100), e(2, '2026-11-03', 100)],
      [l(10, '2026-11-03', 100), l(11, '2026-11-03', 100)],
    );
    expect(r.pares).toHaveLength(2);
    expect(new Set(r.pares.map((p) => p.libroId))).toEqual(new Set([10, 11]));
  });

  it('una referencia demasiado corta no cuenta como referencia', () => {
    const r = emparejar([e(1, '2026-11-03', 100, 'AB-12')], [l(10, '2026-11-03', 100, 'pago 1'), l(11, '2026-11-03', 100, 'otro')]);
    expect(r.pares.every((p) => p.motivo === 'monto-fecha')).toBe(true);
  });
});

describe('3 · cobros del mismo monto en días seguidos', () => {
  const e = (id: number, fecha: string, montoCents: number): LineaExtractoPorEmparejar => ({ id, fecha, montoCents, referencia: null, descripcion: null });
  const l = (id: number, fecha: string, montoCents: number): LineaLibroPorEmparejar => ({ id, fecha, montoCents, texto: '' });

  it('cinco mensualidades de RD$5,000 en cinco días, cada una con su cobro el mismo día, se unen una a una', () => {
    const dias5 = ['2026-11-01', '2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05'];
    const r = emparejar(dias5.map((d, i) => e(i + 1, d, 500_000)), dias5.map((d, i) => l(i + 101, d, 500_000)));
    expect(r.ambiguas).toEqual([]);
    expect(r.pares.map((p) => [p.extractoId, p.libroId]).sort((a, b) => a[0] - b[0])).toEqual([[1, 101], [2, 102], [3, 103], [4, 104], [5, 105]]);
  });

  it('E1 y L1 el día 1, E2 y L2 el día 3: cada una con la suya', () => {
    const r = emparejar([e(1, '2026-11-01', 500_000), e(2, '2026-11-03', 500_000)], [l(11, '2026-11-01', 500_000), l(12, '2026-11-03', 500_000)]);
    expect(r.pares.map((p) => [p.extractoId, p.libroId]).sort()).toEqual([[1, 11], [2, 12]]);
  });

  it('si hay empate (dos líneas igual de cerca del mismo apunte) sigue ambiguo', () => {
    const r = emparejar([e(1, '2026-11-01', 100), e(2, '2026-11-03', 100)], [l(11, '2026-11-02', 100)]);
    expect(r.pares).toEqual([]);
    expect(r.ambiguas.map((a) => a.extractoId).sort()).toEqual([1, 2]);
  });

  it('fuera de ±7 días no se une aunque sea la mejor pareja', () => {
    expect(emparejar([e(1, '2026-11-01', 100)], [l(11, '2026-11-12', 100)]).pares).toEqual([]);
  });
});

describe('6 · encabezados: lo exacto gana a «contiene»', () => {
  it('«Descripción del cargo» es la descripción, no el débito', () => {
    const r = interpretarExtracto([
      ['Fecha', 'Descripción del cargo', 'Débito', 'Crédito'],
      ['03/11/2026', 'Cargo mensual por mantenimiento', '25.00', ''],
    ]);
    expect(r.filas[0]).toMatchObject({ descripcion: 'Cargo mensual por mantenimiento', montoCents: -2500 });
    expect(r.columnas.descripcion).toBe('Descripción del cargo');
  });

  it('un encabezado de concepto o detalle no se toma por importe', () => {
    const r = interpretarExtracto([
      ['Fecha', 'Detalle del crédito', 'Concepto del débito', 'Monto'],
      ['03/11/2026', 'x', 'y', '10.00'],
    ]);
    expect(r.filas[0].montoCents).toBe(1000);
  });

  it('«Cargo» exacto sigue siendo el débito', () => {
    const r = interpretarExtracto([['Fecha', 'Cargo', 'Abono'], ['03/11/2026', '5.00', ''], ['04/11/2026', '', '7.00']]);
    expect(r.filas.map((f) => f.montoCents)).toEqual([-500, 700]);
  });
});
