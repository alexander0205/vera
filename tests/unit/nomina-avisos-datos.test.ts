import { describe, it, expect } from 'vitest';
import { avisoCedula, cedulaConFormato, equivalenteMensual, nombresSinCedula, soloDigitos } from '@/lib/nomina/avisos-datos';

describe('avisos de datos de Nómina', () => {
  it('solo deja los dígitos', () => {
    expect(soloDigitos('001-1234567-8')).toBe('00112345678');
    expect(soloDigitos(null)).toBe('');
  });

  it('la cédula necesita 11 dígitos', () => {
    expect(cedulaConFormato('001-1234567-8')).toBe(true);
    expect(cedulaConFormato('0011234567')).toBe(false);
    expect(cedulaConFormato('')).toBe(false);
    expect(cedulaConFormato(null)).toBe(false);
  });

  it('avisa cuando la cédula está en blanco o incompleta, y calla cuando está bien', () => {
    expect(avisoCedula('')).toMatch(/Sin cédula/);
    expect(avisoCedula('  ')).toMatch(/TSS/);
    expect(avisoCedula('12345')).toMatch(/11 dígitos \(tiene 5\)/);
    expect(avisoCedula('00112345678')).toBeNull();
  });

  it('lista a quienes no tienen cédula válida en una corrida', () => {
    expect(nombresSinCedula([
      { nombre: 'Ana', cedula: '00112345678' },
      { nombre: 'Luis', cedula: null },
      { nombre: 'Rosa', cedula: '123' },
    ])).toEqual(['Luis', 'Rosa']);
  });

  it('un monto por corrida en quincenal suma dos al mes; en mensual no hay nada que avisar', () => {
    expect(equivalenteMensual('quincenal', '1,500')).toEqual({ corridas: 2, totalPesos: 3000 });
    expect(equivalenteMensual('mensual', '1500')).toBeNull();
    expect(equivalenteMensual('quincenal', '')).toBeNull();
    expect(equivalenteMensual('quincenal', 'abc')).toBeNull();
  });
});
