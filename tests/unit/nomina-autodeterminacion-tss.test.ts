import { describe, it, expect } from 'vitest';
import { generarAutodeterminacionTSS, type LineaTSS } from '@/lib/nomina/autodeterminacion-tss';

const linea = (over: Partial<LineaTSS> = {}): LineaTSS => ({
  nombre: 'Ana Pérez', cedula: '00112345678', brutoCents: 5_000_000,
  afpEmpleadoCents: 143_500, sfsEmpleadoCents: 152_000,
  afpPatronalCents: 355_000, sfsPatronalCents: 354_500,
  srlPatronalCents: 55_000, infotepPatronalCents: 50_000,
  ...over,
});

describe('generarAutodeterminacionTSS', () => {
  it('totaliza AFP/SFS (empleado+patronal), SRL e INFOTEP', () => {
    const a = generarAutodeterminacionTSS([linea()], { periodo: '2026-08' });
    const t = a.totales;
    expect(a.totalEmpleados).toBe(1);
    expect(t.afpTotalCents).toBe(143_500 + 355_000);
    expect(t.sfsTotalCents).toBe(152_000 + 354_500);
    expect(t.srlPatronalCents).toBe(55_000);
    expect(t.infotepPatronalCents).toBe(50_000);
    expect(t.totalTSSCents).toBe(t.afpTotalCents + t.sfsTotalCents + t.srlPatronalCents + t.infotepPatronalCents);
  });

  it('suma varias líneas', () => {
    const a = generarAutodeterminacionTSS([linea(), linea({ nombre: 'Beto' })], { periodo: '2026-08' });
    expect(a.totalEmpleados).toBe(2);
    expect(a.totales.salarioCents).toBe(10_000_000);
    expect(a.totales.afpEmpleadoCents).toBe(287_000);
  });

  it('el CSV trae cabecera, una fila por empleado y una de TOTALES', () => {
    const a = generarAutodeterminacionTSS([linea(), linea({ nombre: 'Beto' })], { periodo: '2026-08' });
    const filas = a.contenido.trim().split('\r\n');
    expect(filas[0]).toContain('Cedula');
    expect(filas.length).toBe(1 + 2 + 1); // cabecera + 2 empleados + totales
    expect(filas[filas.length - 1]).toContain('TOTALES');
    expect(a.nombreArchivo).toBe('autodeterminacion-tss-2026-08.csv');
  });

  it('lista vacía → totales en 0 pero con cabecera y fila TOTALES', () => {
    const a = generarAutodeterminacionTSS([], { periodo: '2026-08' });
    expect(a.totales.totalTSSCents).toBe(0);
    const filas = a.contenido.trim().split('\r\n');
    expect(filas.length).toBe(2); // cabecera + totales
  });
});
