import { describe, it, expect } from 'vitest';
import {
  leerCedula, leerFecha, leerFilasEmpleados, leerFrecuencia, leerPesos, leerTipoCuenta, COLUMNAS_EMPLEADOS,
} from '@/lib/nomina/empleados-excel';
import { construirLibroEmpleados, leerHojaEmpleados, type EmpleadoParaPlantilla } from '@/lib/nomina/empleados-excel-libro';

const HOY = '2026-10-09';
const ENC = [...COLUMNAS_EMPLEADOS];
/** Una hoja con el encabezado y las filas dadas, en el orden de COLUMNAS_EMPLEADOS. */
const hoja = (...filas: unknown[][]) => [ENC, ...filas];
const fila = (o: Partial<Record<(typeof COLUMNAS_EMPLEADOS)[number], unknown>>) => COLUMNAS_EMPLEADOS.map((c) => o[c] ?? '');

describe('leerCedula', () => {
  it('acepta 11 dígitos con o sin guiones y espacios', () => {
    expect(leerCedula('00100000011').cedula).toBe('00100000011');
    expect(leerCedula('001-0000001-1').cedula).toBe('00100000011');
    expect(leerCedula(' 001 0000001 1 ').cedula).toBe('00100000011');
  });
  it('un número de Excel sin el cero inicial se rellena y avisa', () => {
    const r = leerCedula(100000011);
    expect(r.cedula).toBe('00100000011');
    expect(r.aviso).toMatch(/cero inicial/);
  });
  it('rechaza lo que no sea una cédula', () => {
    for (const v of ['', null, undefined, 'abc', '123', '1234567890123', '001-ABCDEFG-1', 12345]) {
      expect(leerCedula(v).error).toBeTruthy();
    }
  });
});

describe('leerPesos', () => {
  it('número, texto con miles, y la basura de decimales de Excel', () => {
    expect(leerPesos(35000, 'S').cents).toBe(3_500_000);
    expect(leerPesos('35,000.50', 'S').cents).toBe(3_500_050);
    expect(leerPesos('RD$ 35,000', 'S').cents).toBe(3_500_000);
    expect(leerPesos(30000.300000000003, 'S').cents).toBe(3_000_030);
    expect(leerPesos('', 'S')).toEqual({});
    expect(leerPesos(null, 'S')).toEqual({});
  });
  it('rechaza comas decimales, negativos y más de 2 decimales', () => {
    for (const v of ['35.000,50', '12,50', 'abc', -5, '-5', 1.005, '1.234', NaN]) {
      expect(leerPesos(v, 'S').error).toBeTruthy();
    }
  });
});

describe('leerFecha', () => {
  it('día/mes/año, ISO y fecha de Excel', () => {
    expect(leerFecha('15/01/2026', HOY).fecha).toBe('2026-01-15');
    expect(leerFecha('5-3-2025', HOY).fecha).toBe('2025-03-05');
    expect(leerFecha('2026-01-15', HOY).fecha).toBe('2026-01-15');
    expect(leerFecha(new Date('2026-01-15T00:00:00Z'), HOY).fecha).toBe('2026-01-15');
    expect(leerFecha('', HOY)).toEqual({});
  });
  it('rechaza fechas imposibles, antiguas o muy futuras', () => {
    for (const v of ['31/02/2026', '2026-13-01', 'ayer', '15/01/26', '01/01/1900', '01/01/2099', '1/1']) {
      expect(leerFecha(v, HOY).error).toBeTruthy();
    }
  });
});

describe('frecuencia y tipo de cuenta', () => {
  it('aceptan variantes y rechazan lo demás', () => {
    expect(leerFrecuencia('Quincenal')).toBe('quincenal');
    expect(leerFrecuencia(' MENSUAL ')).toBe('mensual');
    expect(leerFrecuencia('Quinsenal')).toBeNull();
    expect(leerTipoCuenta('Ahorros')).toBe('ahorros');
    expect(leerTipoCuenta('corriente')).toBe('corriente');
    expect(leerTipoCuenta('plazo fijo')).toBeNull();
  });
});

describe('leerFilasEmpleados', () => {
  it('lee una fila completa', () => {
    const r = leerFilasEmpleados(hoja(fila({
      'Cédula': '001-0000001-1', 'Nombres': ' Ana  María ', 'Apellidos': 'Pérez', 'Cargo': 'Maestra',
      'Salario mensual (RD$)': 35000, 'Frecuencia de pago': 'Quincenal', 'Fecha de ingreso': '15/01/2026',
      'Banco': 'Popular', 'Cuenta bancaria': '123-456-789', 'Tipo de cuenta': 'Ahorros', 'Días de vacaciones': 14,
      'Incentivo fijo por corrida (RD$)': 1500, 'Correo': 'ANA@mail.com',
    })), HOY);
    expect(r.errores).toEqual([]);
    expect(r.filas[0]).toMatchObject({
      fila: 2, cedula: '00100000011', nombres: 'Ana María', apellidos: 'Pérez', salarioCents: 3_500_000,
      frecuencia: 'quincenal', ingreso: '2026-01-15', cuenta: '123456789', tipoCuenta: 'ahorros',
      vacaciones: 14, incentivoCents: 150_000, correo: 'ana@mail.com',
    });
  });

  it('celdas vacías quedan sin definir (no borran)', () => {
    const r = leerFilasEmpleados(hoja(fila({ 'Cédula': '00100000011', 'Nombres': 'Ana', 'Apellidos': 'P' })), HOY);
    expect(r.filas[0].salarioCents).toBeUndefined();
    expect(r.filas[0].cargo).toBeUndefined();
    expect(r.filas[0].incentivoCents).toBeUndefined();
  });

  it('encuentra el encabezado aunque haya un título encima y acepta alias', () => {
    const r = leerFilasEmpleados([
      ['Colegio Andrés Bello — Personal 2026'], [],
      ['cedula', 'NOMBRE', 'apellido', 'Sueldo'],
      ['00100000011', 'Ana', 'P', '30,000'],
    ], HOY);
    expect(r.errores).toEqual([]);
    expect(r.filas[0]).toMatchObject({ fila: 4, salarioCents: 3_000_000 });
    expect(r.columnas).toEqual(expect.arrayContaining(['cedula', 'nombres', 'apellidos', 'salario']));
  });

  it('sin encabezado reconocible da un error claro', () => {
    const r = leerFilasEmpleados([['a', 'b'], ['1', '2']], HOY);
    expect(r.filas).toEqual([]);
    expect(r.errores[0].mensaje).toMatch(/encabezados/);
  });

  it('cada error trae su fila de Excel y no frena a las demás', () => {
    const r = leerFilasEmpleados(hoja(
      fila({ 'Cédula': '00100000011', 'Nombres': 'Bien', 'Apellidos': 'Uno', 'Salario mensual (RD$)': 30000 }),
      fila({ 'Cédula': '123', 'Nombres': 'Mala', 'Apellidos': 'Cedula' }),
      fila({ 'Cédula': '00100000012', 'Nombres': 'Mal', 'Apellidos': 'Salario', 'Salario mensual (RD$)': '35.000,50' }),
      fila({ 'Cédula': '00100000013', 'Nombres': 'Mala', 'Apellidos': 'Frec', 'Frecuencia de pago': 'Quinsenal' }),
      fila({ 'Cédula': '00100000014', 'Nombres': 'Mala', 'Apellidos': 'Cuenta', 'Cuenta bancaria': 'ABC' }),
      fila({ 'Cédula': '00100000015', 'Nombres': 'Mal', 'Apellidos': 'Correo', 'Correo': 'sin-arroba' }),
      fila({ 'Cédula': '00100000016', 'Nombres': 'Mal', 'Apellidos': 'Vac', 'Días de vacaciones': 99 }),
      fila({ 'Cédula': '00100000017', 'Nombres': 'Mil', 'Apellidos': 'Millones', 'Salario mensual (RD$)': 99_000_000 }),
    ), HOY);
    expect(r.filas.map((f) => f.cedula)).toEqual(['00100000011']);
    expect(r.errores.map((e) => e.fila)).toEqual([3, 4, 5, 6, 7, 8, 9]);
  });

  it('una cédula repetida en el archivo se rechaza la segunda vez', () => {
    const r = leerFilasEmpleados(hoja(
      fila({ 'Cédula': '00100000011', 'Nombres': 'A', 'Apellidos': 'A' }),
      fila({ 'Cédula': '001-0000001-1', 'Nombres': 'B', 'Apellidos': 'B' }),
    ), HOY);
    expect(r.filas).toHaveLength(1);
    expect(r.errores[0]).toMatchObject({ fila: 3 });
    expect(r.errores[0].mensaje).toMatch(/fila 2/);
  });

  it('avisa (sin rechazar) salario cero, muy bajo y cédula sin cero inicial', () => {
    const r = leerFilasEmpleados(hoja(
      fila({ 'Cédula': 100000011, 'Nombres': 'A', 'Apellidos': 'A', 'Salario mensual (RD$)': 0 }),
      fila({ 'Cédula': '00100000012', 'Nombres': 'B', 'Apellidos': 'B', 'Salario mensual (RD$)': 350 }),
    ), HOY);
    expect(r.errores).toEqual([]);
    expect(r.filas).toHaveLength(2);
    expect(r.avisos.map((a) => a.fila).sort()).toEqual([2, 2, 3]);
  });

  it('salta las filas en blanco y se planta en 3000 empleados', () => {
    const blancas = leerFilasEmpleados(hoja([], fila({}), fila({ 'Cédula': '00100000011', 'Nombres': 'A', 'Apellidos': 'A' })), HOY);
    expect(blancas.filas).toHaveLength(1);
    const muchas = Array.from({ length: 3001 }, (_, i) => fila({ 'Cédula': String(i).padStart(11, '0'), 'Nombres': 'N', 'Apellidos': 'A' }));
    const r = leerFilasEmpleados(hoja(...muchas), HOY);
    expect(r.filas.length).toBe(3000);
    expect(r.errores.some((e) => /pasa de 3000/.test(e.mensaje))).toBe(true);
  });

  it('celdas con fórmula, texto con formato o números en vez de texto', () => {
    const r = leerFilasEmpleados(hoja(fila({
      'Cédula': { result: '00100000011' }, 'Nombres': { richText: [{ text: 'Ana ' }, { text: 'María' }] },
      'Apellidos': 'P', 'Salario mensual (RD$)': { formula: 'A1*2', result: 40000 },
    })), HOY);
    expect(r.errores).toEqual([]);
    expect(r.filas[0]).toMatchObject({ cedula: '00100000011', nombres: 'Ana María', salarioCents: 4_000_000 });
  });

  it('el HTML pasa como texto plano (React lo escapa); las fórmulas se rechazan', () => {
    const ok = leerFilasEmpleados(hoja(fila({ 'Cédula': '00100000011', 'Nombres': '<img src=x onerror=1>', 'Apellidos': "O'Brien \"Q\" & <b>" })), HOY);
    expect(ok.errores).toEqual([]);
    expect(ok.filas[0].nombres).toBe('<img src=x onerror=1>');
    for (const peligro of ['=CMD()', '+1+1', '@SUM(A1)', '-2+3']) {
      const r = leerFilasEmpleados(hoja(fila({ 'Cédula': '00100000011', 'Nombres': 'Ana', 'Apellidos': 'P', 'Cargo': peligro })), HOY);
      expect(r.filas).toEqual([]);
      expect(r.errores[0].mensaje).toMatch(/fórmula/);
    }
  });

  it('rechaza textos más largos que su columna en la base (si no, fallaría TODO el guardado)', () => {
    const r = leerFilasEmpleados(hoja(
      fila({ 'Cédula': '00100000011', 'Nombres': 'N'.repeat(161), 'Apellidos': 'A' }),
      fila({ 'Cédula': '00100000012', 'Nombres': 'N'.repeat(160), 'Apellidos': 'A'.repeat(160), 'Cargo': 'C'.repeat(120) }),
      fila({ 'Cédula': '00100000013', 'Nombres': 'N', 'Apellidos': 'A', 'Teléfono': '1'.repeat(31) }),
    ), HOY);
    expect(r.filas.map((f) => f.cedula)).toEqual(['00100000012']);
    expect(r.errores.map((e) => e.fila)).toEqual([2, 4]);
  });

  it('quita caracteres de control y de dirección de texto', () => {
    const r = leerFilasEmpleados(hoja(fila({ 'Cédula': '00100000011', 'Nombres': 'Ana\u0000\u202e  Maria\u200b', 'Apellidos': '\u0007Perez' })), HOY);
    expect(r.filas[0].nombres).toBe('Ana Maria');
    expect(r.filas[0].apellidos).toBe('Perez');
  });
});

describe('plantilla de Excel: ida y vuelta', () => {
  const emp: EmpleadoParaPlantilla[] = [
    {
      cedula: '00100000011', nombres: 'Ana María', apellidos: 'Pérez', cargo: 'Maestra', salarioBaseCents: 3_500_050,
      frecuenciaPago: 'quincenal', fechaIngreso: '2026-01-15', bancoNombre: 'Popular', bancoCuenta: '0012345678',
      bancoTipoCuenta: 'ahorros', afp: 'Siembra', ars: 'Humano', vacacionesDias: 14, incentivoCents: 150_000,
      telefono: '8095550101', email: 'ana@mail.com',
    },
    {
      cedula: '00200000022', nombres: 'Luis', apellidos: 'Ñúñez', cargo: null, salarioBaseCents: 2_000_000,
      frecuenciaPago: 'mensual', fechaIngreso: null, bancoNombre: null, bancoCuenta: null, bancoTipoCuenta: null,
      afp: null, ars: null, vacacionesDias: null, incentivoCents: null, telefono: null, email: null,
    },
  ];

  it('lo descargado y vuelto a leer es lo mismo, con cédulas que conservan el cero', async () => {
    const wb = construirLibroEmpleados(emp);
    const buf = await wb.xlsx.writeBuffer();
    const matriz = await leerHojaEmpleados(buf as ArrayBuffer);
    const r = leerFilasEmpleados(matriz, HOY);
    expect(r.errores).toEqual([]);
    expect(r.avisos).toEqual([]);
    expect(r.filas).toHaveLength(2);
    // Ordenadas por apellido: Ñúñez antes que Pérez según localeCompare.
    const ana = r.filas.find((f) => f.cedula === '00100000011')!;
    expect(ana).toMatchObject({
      nombres: 'Ana María', apellidos: 'Pérez', cargo: 'Maestra', salarioCents: 3_500_050, frecuencia: 'quincenal',
      ingreso: '2026-01-15', banco: 'Popular', cuenta: '0012345678', tipoCuenta: 'ahorros', afp: 'Siembra',
      ars: 'Humano', vacaciones: 14, incentivoCents: 150_000, telefono: '8095550101', correo: 'ana@mail.com',
    });
    const luis = r.filas.find((f) => f.cedula === '00200000022')!;
    expect(luis.salarioCents).toBe(2_000_000);
    expect(luis.frecuencia).toBe('mensual');
    expect(luis.cargo).toBeUndefined();
    expect(luis.ingreso).toBeUndefined();
  });

  it('rechaza un archivo que no es Excel', async () => {
    await expect(leerHojaEmpleados(new TextEncoder().encode('no soy excel').buffer as ArrayBuffer)).rejects.toThrow(/Excel/);
  });
});
