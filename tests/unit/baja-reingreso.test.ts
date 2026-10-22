/**
 * Unit tests — dar de baja y reactivar a un alumno.
 *
 * Lo que se protege aquí es dinero: que al volver no se le cobren los meses en
 * que estuvo fuera, y que al irse solo se anulen cuotas que de verdad no cursó.
 */

import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/db/drizzle', () => ({ db: {} }));

import {
  alinearAlCalendario, anotar, esCargoPosteriorAnulable, esDelReingresoEnAdelante,
  esFechaValida, estadoMatriculaDeBaja,
} from '@/lib/administracion-escolar/baja-reingreso';

describe('alinearAlCalendario', () => {
  it('salta los meses fuera: vuelve el 10 de febrero, cobra el 5 de marzo', () => {
    expect(alinearAlCalendario('2026-08-05', 'mensual', 5, '2027-02-10')).toBe('2027-03-05');
  });

  it('si vuelve justo el día de cobro, ese mismo día', () => {
    expect(alinearAlCalendario('2026-08-05', 'mensual', 5, '2027-02-05')).toBe('2027-02-05');
  });

  it('respeta el día 31 en meses cortos', () => {
    expect(alinearAlCalendario('2026-08-31', 'mensual', 31, '2027-02-01')).toBe('2027-02-28');
  });

  it('si vuelve antes del inicio, el inicio no cambia', () => {
    expect(alinearAlCalendario('2026-08-05', 'mensual', 5, '2026-07-01')).toBe('2026-08-05');
  });
});

describe('esCargoPosteriorAnulable', () => {
  const base = { ecfDocumentId: null, montoCentavos: 3700_00, saldoCentavos: 3700_00, estado: 'pendiente' };

  it('el mes en que se va se queda; el siguiente se puede anular', () => {
    expect(esCargoPosteriorAnulable({ ...base, mes: 10, anio: 2026 }, '2026-10-19')).toBe(false);
    expect(esCargoPosteriorAnulable({ ...base, mes: 11, anio: 2026 }, '2026-10-19')).toBe(true);
  });

  it('cruza el año: enero del siguiente es posterior a diciembre', () => {
    expect(esCargoPosteriorAnulable({ ...base, mes: 1, anio: 2027 }, '2026-12-15')).toBe(true);
  });

  it('no toca lo que tiene factura, abono, ya anulado o no es de un mes', () => {
    const nov = { ...base, mes: 11, anio: 2026 };
    expect(esCargoPosteriorAnulable({ ...nov, ecfDocumentId: 9 }, '2026-10-19')).toBe(false);
    expect(esCargoPosteriorAnulable({ ...nov, saldoCentavos: 1000_00 }, '2026-10-19')).toBe(false);
    expect(esCargoPosteriorAnulable({ ...nov, estado: 'anulado' }, '2026-10-19')).toBe(false);
    expect(esCargoPosteriorAnulable({ ...nov, mes: null }, '2026-10-19')).toBe(false);
  });
});

describe('estadoMatriculaDeBaja', () => {
  it('el que se gradúa termina; el que se va o se inactiva se retira', () => {
    expect(estadoMatriculaDeBaja('graduado')).toBe('finalizada');
    expect(estadoMatriculaDeBaja('retirado')).toBe('retirada');
    expect(estadoMatriculaDeBaja('inactivo')).toBe('retirada');
  });
});

describe('anotar', () => {
  it('añade una línea fechada sin pisar las notas', () => {
    expect(anotar(null, '2026-10-19', 'Baja: Retirado.')).toBe('[2026-10-19] Baja: Retirado.');
    expect(anotar('Importado de SIGERD.', '2026-10-19', 'Baja: Retirado.'))
      .toBe('Importado de SIGERD.\n[2026-10-19] Baja: Retirado.');
  });
});

describe('esDelReingresoEnAdelante', () => {
  it('el mes en que vuelve cuenta; los de antes no', () => {
    expect(esDelReingresoEnAdelante({ mes: 2, anio: 2027 }, '2027-02-10')).toBe(true);
    expect(esDelReingresoEnAdelante({ mes: 1, anio: 2027 }, '2027-02-10')).toBe(false);
    expect(esDelReingresoEnAdelante({ mes: null, anio: 2027 }, '2027-02-10')).toBe(false);
  });
});

describe('esFechaValida', () => {
  it('acepta fechas de calendario reales', () => {
    expect(esFechaValida('2026-10-22')).toBe(true);
    expect(esFechaValida('2028-02-29')).toBe(true);
  });

  it('rechaza las que cumplen el patrón pero no existen, y las mal escritas', () => {
    expect(esFechaValida('2026-13-45')).toBe(false);
    expect(esFechaValida('2026-02-30')).toBe(false);
    expect(esFechaValida('2027-02-29')).toBe(false);
    expect(esFechaValida('22/10/2026')).toBe(false);
    expect(esFechaValida('')).toBe(false);
  });
});
