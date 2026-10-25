/**
 * Configuración › Cobros: la lista de bancos y de tipos de cuenta reconoce lo
 * que ya estaba escrito a mano, para no mandar a «Otro…» un banco de la lista.
 */
import { describe, expect, it } from 'vitest';
import { opcionQueCoincide } from '@/app/escolar/configuracion/cobros/_page-client';

const BANCOS = ['Banco Popular', 'Banreservas', 'BHD', 'Asociación La Nacional'];
const TIPOS = ['Ahorros', 'Corriente'];

describe('opcionQueCoincide', () => {
  it('reconoce lo escrito de otra forma', () => {
    expect(opcionQueCoincide('Banco Popular Dominicano', BANCOS)).toBe('Banco Popular');
    expect(opcionQueCoincide('Banco BHD', BANCOS)).toBe('BHD');
    expect(opcionQueCoincide('Asociacion La Nacional', BANCOS)).toBe('Asociación La Nacional');
    expect(opcionQueCoincide('Cuenta corriente', TIPOS)).toBe('Corriente');
    expect(opcionQueCoincide('CORRIENTE', TIPOS)).toBe('Corriente');
    expect(opcionQueCoincide('Ahorro', TIPOS)).toBe('Ahorros');
    expect(opcionQueCoincide('Cuenta de ahorros', TIPOS)).toBe('Ahorros');
  });

  it('lo que no está en la lista queda para «Otro…»', () => {
    expect(opcionQueCoincide('Banco Vimenca', BANCOS)).toBeNull();
    expect(opcionQueCoincide('', BANCOS)).toBeNull();
    expect(opcionQueCoincide('Nómina', TIPOS)).toBeNull();
  });
});
