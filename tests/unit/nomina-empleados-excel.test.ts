import { describe, it, expect } from 'vitest';
import { COLUMNAS_EMPLEADOS, leerCedula, leerFilasEmpleados, leerFrecuencia, leerPesos } from '@/lib/nomina/empleados-excel';

const HOY = '2026-11-05';
const ENCABEZADO = [...COLUMNAS_EMPLEADOS] as string[];
const fila = (valores: Record<string, unknown>) => ENCABEZADO.map((c) => valores[c] ?? '');

describe('importar empleados desde Excel', () => {
  it('lee una fila válida con salario, frecuencia e incentivo', () => {
    const r = leerFilasEmpleados([
      ENCABEZADO,
      fila({
        'Cédula': '00112345678', 'Nombres': 'Ana', 'Apellidos': 'Prueba', 'Salario mensual (RD$)': '45,000.00',
        'Frecuencia de pago': 'Quincenal', 'Fecha de ingreso': '2026-01-15', 'Incentivo fijo por corrida (RD$)': 1500,
      }),
    ], HOY);
    expect(r.errores).toEqual([]);
    expect(r.filas).toHaveLength(1);
    expect(r.filas[0].salarioCents).toBe(4_500_000);
    expect(r.filas[0].frecuencia).toBe('quincenal');
    expect(r.filas[0].incentivoCents).toBe(150_000);
  });

  it('reporta como error la fila sin cédula o con salario inválido, sin tumbar las demás', () => {
    const r = leerFilasEmpleados([
      ENCABEZADO,
      fila({ 'Cédula': '', 'Nombres': 'Sin cédula', 'Salario mensual (RD$)': 1000 }),
      fila({ 'Cédula': '00112345678', 'Nombres': 'Luis', 'Salario mensual (RD$)': 'mucho' }),
      fila({ 'Cédula': '00198765432', 'Nombres': 'Marta', 'Salario mensual (RD$)': 20000 }),
    ], HOY);
    expect(r.errores.length).toBeGreaterThanOrEqual(2);
    expect(r.filas.map((f) => f.nombres)).toEqual(['Marta']);
  });

  it('las ayudas de lectura rechazan lo dudoso', () => {
    expect(leerPesos('12,50', 'Salario').error).toBeTruthy();
    expect(leerPesos(-5, 'Salario').error).toBeTruthy();
    expect(leerFrecuencia('mensual')).toBe('mensual');
    expect(leerFrecuencia('cada tanto')).toBeNull();
    expect(leerCedula('123').error ?? leerCedula('123').aviso).toBeTruthy();
  });
});
