import { describe, it, expect } from 'vitest';
import {
  rellenarPlantilla, variablesDeContrato, montoEnLetras, fechaLarga,
} from '@/lib/nomina/contratos';

const empleado = {
  nombres: 'Carmen', apellidos: 'Jiménez', cedula: '00112345678',
  cargo: 'Directora', salarioBaseCents: 5_000_000,
  tipoContrato: 'indefinido', frecuenciaPago: 'mensual', fechaIngreso: '2026-01-15',
};
const empresa = { nombre: 'ACME SRL', rnc: '130123456', direccion: 'Av. Siempre Viva 1' };

describe('rellenarPlantilla', () => {
  const vars = variablesDeContrato(empleado, empresa, '2026-08-25');

  it('reemplaza los marcadores por los datos del empleado y la empresa', () => {
    const out = rellenarPlantilla('{{nombre}}, {{cargo}} en {{empresa}}. Cédula {{cedula}}.', vars);
    expect(out).toBe('Carmen Jiménez, Directora en ACME SRL. Cédula 00112345678.');
  });

  it('formatea salario, tipo de contrato, frecuencia y fechas', () => {
    expect(vars.salario).toBe('RD$50,000.00');
    expect(vars.salario_letras).toContain('Cincuenta mil');
    expect(vars.tipo_contrato).toBe('por tiempo indefinido');
    expect(vars.frecuencia).toBe('mensual');
    expect(vars.fecha_ingreso).toBe('15 de enero de 2026');
    expect(vars.fecha).toBe('25 de agosto de 2026');
    expect(vars.empresa_rnc).toBe('130123456');
  });

  it('tolera espacios en el marcador y respeta mayúsculas de la clave', () => {
    expect(rellenarPlantilla('{{ nombre }}', vars)).toBe('Carmen Jiménez');
    expect(rellenarPlantilla('{{NOMBRE}}', vars)).toBe('Carmen Jiménez');
  });

  it('deja intacto un marcador desconocido (para ver el typo)', () => {
    expect(rellenarPlantilla('Hola {{nomrbe}}', vars)).toBe('Hola {{nomrbe}}');
  });

  it('campos nulos caen a un guion', () => {
    const v = variablesDeContrato({ ...empleado, cedula: null, cargo: null, fechaIngreso: null }, empresa, '2026-08-25');
    expect(v.cedula).toBe('—');
    expect(v.cargo).toBe('—');
    expect(v.fecha_ingreso).toBe('—');
  });
});

describe('montoEnLetras', () => {
  it('convierte centavos a letras con /100', () => {
    expect(montoEnLetras(5_000_000)).toBe('Cincuenta mil con 00/100');
    expect(montoEnLetras(0)).toBe('Cero con 00/100');
    expect(montoEnLetras(123_45)).toBe('Ciento Veintitres con 45/100');
  });
});

describe('fechaLarga', () => {
  it('formatea o cae a guion', () => {
    expect(fechaLarga('2026-12-31')).toBe('31 de diciembre de 2026');
    expect(fechaLarga(null)).toBe('—');
  });
});
