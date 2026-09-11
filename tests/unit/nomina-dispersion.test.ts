import { describe, it, expect } from 'vitest';
import { generarArchivoDispersion, type BeneficiarioDispersion } from '@/lib/nomina/dispersion';
import { FORMATOS_BANCO } from '@/lib/nomina/formatos-banco';

const ben = (id: number, neto: number, banco: string | null, cuenta: string | null, tipo = 'ahorros'): BeneficiarioDispersion => ({
  empleadoId: id, nombre: `Emp ${id}`, cedula: '00112345678', netoCents: neto,
  bancoNombre: banco, bancoCuenta: cuenta, bancoTipoCuenta: tipo,
});

describe('generarArchivoDispersion — genérico', () => {
  it('incluye solo a quien tiene banco y cuenta; el resto va a incompletos', () => {
    const a = generarArchivoDispersion(
      [ben(1, 4_119_217, 'Popular', '960123'), ben(2, 3_000_000, null, null), ben(3, 2_000_000, 'BHD', '')],
      { periodo: '2026-07', referencia: 'Nomina 2026-07' },
    );
    expect(a.totalBeneficiarios).toBe(1);
    expect(a.totalCents).toBe(4_119_217);
    expect(a.incompletos.map((i) => i.empleadoId)).toEqual([2, 3]);
  });

  it('CSV con cabecera, monto en pesos y nombre de archivo con el formato', () => {
    const a = generarArchivoDispersion(
      [ben(1, 4_119_217, 'Popular', '960123')],
      { periodo: '2026-07', referencia: 'Nomina 2026-07' },
    );
    const lineas = a.contenido.trim().split('\r\n');
    expect(lineas[0]).toBe('Cedula,Nombre,Banco,TipoCuenta,Cuenta,MontoRD,Referencia');
    expect(lineas[1]).toContain('41192.17');
    expect(a.nombreArchivo).toBe('dispersion-nomina-2026-07-generico.csv');
    expect(a.nota).toBeUndefined();
  });

  it('escapa el delimitador en el nombre', () => {
    const b: BeneficiarioDispersion = { ...ben(1, 100_000, 'Popular', '1'), nombre: 'Peralta, María' };
    const a = generarArchivoDispersion([b], { periodo: '2026-07', referencia: 'x' });
    expect(a.contenido).toContain('"Peralta, María"');
  });
});

describe('generarArchivoDispersion — presets por banco', () => {
  it('Banreservas: sin cabecera, orden propio y tipo de cuenta mapeado (AH)', () => {
    const a = generarArchivoDispersion(
      [ben(1, 4_119_217, 'Banreservas', '960123', 'ahorros')],
      { periodo: '2026-07', referencia: 'Nomina 2026-07', formatoKey: 'banreservas' },
    );
    // Columnas: cuenta, monto, tipoCuenta, cedula, nombre — sin fila de cabecera.
    expect(a.contenido.trim()).toBe('960123,41192.17,AH,00112345678,Emp 1');
    expect(a.nota).toBeTruthy();
    expect(a.nombreArchivo).toBe('dispersion-nomina-2026-07-banreservas.csv');
  });

  it('Popular: tipo de cuenta corriente → 2', () => {
    const a = generarArchivoDispersion(
      [ben(1, 100_000, 'Popular', '55', 'corriente')],
      { periodo: '2026-07', referencia: 'REF', formatoKey: 'popular' },
    );
    const filas = a.contenido.trim().split('\r\n');
    // cabecera + 1 fila; columnas: cuenta,tipoCuenta,monto,cedula,nombre,referencia
    expect(filas[1]).toBe('55,2,1000.00,00112345678,Emp 1,REF');
  });

  it('cada formato del registro produce contenido sin reventar', () => {
    for (const f of FORMATOS_BANCO) {
      const a = generarArchivoDispersion(
        [ben(1, 100_000, 'X', '1', 'ahorros')],
        { periodo: '2026-07', referencia: 'r', formatoKey: f.key },
      );
      expect(a.totalBeneficiarios).toBe(1);
      expect(a.contenido.length).toBeGreaterThan(0);
    }
  });

  it('formato desconocido cae al genérico', () => {
    const a = generarArchivoDispersion(
      [ben(1, 100_000, 'X', '1')],
      { periodo: '2026-07', referencia: 'r', formatoKey: 'inexistente' },
    );
    expect(a.formato).toBe('generico');
  });
});
