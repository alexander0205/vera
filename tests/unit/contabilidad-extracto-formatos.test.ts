import { describe, expect, it } from 'vitest';
import { archivoDescendente, elegirUltimoSaldo, interpretarExtracto, leerCsv, leerFecha, leerMonto } from '@/lib/contabilidad/extracto';

describe('estado de cuenta: formatos de bancos', () => {
  it('detecta el delimitador con la fila de encabezados, no con el título del banco', () => {
    const csv = [
      'Banco BHD - Estado de cuenta',
      'Cuenta corriente 123456789',
      'Cliente: COLEGIO DEMO SRL',
      '',
      'Fecha;Descripción;Referencia;Débito;Crédito;Balance',
      '02/10/2026;DEPOSITO EN VENTANILLA;55120931;;250,000.00;250,000.00',
      '05/11/2026;CARGO COMISION;;350.00;;249,650.00',
    ].join('\n');
    const m = leerCsv(csv);
    const r = interpretarExtracto(m);
    expect(r.filas).toHaveLength(2);
    expect(r.filas[0]).toMatchObject({ fecha: '2026-10-02', montoCents: 25_000_000, referencia: '55120931' });
    expect(r.filas[1].montoCents).toBe(-35_000);
  });

  it('un título con comas no cambia el delimitador de punto y coma', () => {
    const csv = 'Estado de cuenta, octubre, 2026, Banco\nFecha;Monto\n01/10/2026;1,500.00\n';
    expect(interpretarExtracto(leerCsv(csv)).filas[0].montoCents).toBe(150_000);
  });

  it('entiende los sufijos CR y DB', () => {
    expect(leerMonto('1,500.00 CR')).toBe(150_000);
    expect(leerMonto('1,500.00 DB')).toBe(-150_000);
    expect(leerMonto('350.00DB')).toBe(-35_000);
  });

  it('entiende meses escritos', () => {
    expect(leerFecha('15-ene-2024')).toBe('2024-01-15');
    expect(leerFecha('3 Octubre 2026')).toBe('2026-10-03');
    expect(leerFecha('15/Dec/24')).toBe('2024-12-15');
    expect(leerFecha('15-xyz-2024')).toBeNull();
  });

  it('un título que también dice «fecha» no gana al encabezado', () => {
    const csv = [
      'Banco BHD - Estado de cuenta',
      'Fecha de impresión: 06/11/2026, 10:15',
      '',
      'Fecha;Descripción;Referencia;Débito;Crédito;Balance',
      '02/10/2026;DEPOSITO;55120931;;250,000.00;250,000.00',
    ].join('\n');
    const r = interpretarExtracto(leerCsv(csv));
    expect(r.filas).toHaveLength(1);
    expect(r.filas[0].montoCents).toBe(25_000_000);
  });
});

describe('saldo final del archivo', () => {
  const dia = [{ id: 10, saldo: 100 }, { id: 11, saldo: 200 }, { id: 12, saldo: 300 }];
  it('detecta si el archivo viene con lo más nuevo primero', () => {
    expect(archivoDescendente(['2026-10-01', '2026-10-05', '2026-11-05'])).toBe(false);
    expect(archivoDescendente(['2026-11-05', '2026-10-05', '2026-10-01'])).toBe(true);
    expect(archivoDescendente(['2026-11-05'])).toBe(false);
  });
  it('ascendente: la última línea del archivo del último día; descendente: la primera', () => {
    expect(elegirUltimoSaldo(dia, false)?.saldo).toBe(300);
    expect(elegirUltimoSaldo(dia, true)?.saldo).toBe(100);
    expect(elegirUltimoSaldo([], false)).toBeNull();
  });
});
