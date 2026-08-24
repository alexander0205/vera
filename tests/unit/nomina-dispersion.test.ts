import { describe, it, expect } from 'vitest';
import { generarArchivoDispersion, type BeneficiarioDispersion } from '@/lib/nomina/dispersion';

const ben = (id: number, neto: number, banco: string | null, cuenta: string | null): BeneficiarioDispersion => ({
  empleadoId: id, nombre: `Emp ${id}`, cedula: '00112345678', netoCents: neto,
  bancoNombre: banco, bancoCuenta: cuenta, bancoTipoCuenta: 'ahorros',
});

describe('generarArchivoDispersion', () => {
  it('incluye solo a quien tiene banco y cuenta; el resto va a incompletos', () => {
    const a = generarArchivoDispersion(
      [ben(1, 4_119_217, 'Popular', '960123'), ben(2, 3_000_000, null, null), ben(3, 2_000_000, 'BHD', '')],
      { periodo: '2026-07', referencia: 'Nomina 2026-07' },
    );
    expect(a.totalBeneficiarios).toBe(1);
    expect(a.totalCents).toBe(4_119_217);
    expect(a.incompletos).toHaveLength(2);
    expect(a.incompletos.map((i) => i.empleadoId)).toEqual([2, 3]);
  });

  it('el CSV lleva cabecera y el monto va en pesos con 2 decimales', () => {
    const a = generarArchivoDispersion(
      [ben(1, 4_119_217, 'Popular', '960123')],
      { periodo: '2026-07', referencia: 'Nomina 2026-07' },
    );
    const lineas = a.contenido.trim().split('\r\n');
    expect(lineas[0]).toBe('Cedula,Nombre,Banco,TipoCuenta,Cuenta,MontoRD,Referencia');
    expect(lineas[1]).toContain('41192.17');
    expect(a.nombreArchivo).toBe('dispersion-nomina-2026-07.csv');
  });

  it('escapa comas en el nombre para no romper columnas', () => {
    const b: BeneficiarioDispersion = { ...ben(1, 100_000, 'Popular', '1'), nombre: 'Peralta, María' };
    const a = generarArchivoDispersion([b], { periodo: '2026-07', referencia: 'x' });
    expect(a.contenido).toContain('"Peralta, María"');
  });
});
