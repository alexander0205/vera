/**
 * Unit tests — validación de ids y fechas que llegan de fuera al MCP.
 *
 * Los dos casos que se prueban aquí llegaron a producir un resultado equivocado
 * y un 500 respectivamente, medidos contra el servidor de verdad.
 */
import { describe, it, expect } from 'vitest';
import { idValido, fechaValida } from '@/lib/mcp/ids';

describe('idValido', () => {
  it('acepta un id normal', () => {
    expect(idValido('1668')).toBe(1668);
    expect(idValido('1')).toBe(1);
  });

  /**
   * El fallo: `parseInt('1e+21')` es 1, así que `get_client({id: 1e21})`
   * devolvía el cliente número 1 — un registro que nadie pidió.
   */
  it('rechaza notación científica en vez de truncarla', () => {
    expect(idValido('1e+21')).toBeNull();
    expect(idValido('1e21')).toBeNull();
  });

  it('rechaza lo que no son dígitos', () => {
    for (const v of ['abc', '', ' ', '12abc', 'abc12', '1.5', '-3', '+7', '0x10']) {
      expect(idValido(v)).toBeNull();
    }
  });

  it('rechaza el cero y los negativos: no hay serial que valga eso', () => {
    expect(idValido('0')).toBeNull();
    expect(idValido('-1')).toBeNull();
  });

  /** Un id mayor que `integer` no existe en la tabla y revienta la consulta. */
  it('rechaza lo que no cabe en un integer de Postgres', () => {
    expect(idValido('2147483647')).toBe(2147483647); // el tope justo, sí
    expect(idValido('2147483648')).toBeNull();       // uno más, no
    expect(idValido('99999999999')).toBeNull();
  });

  it('no se cuela por espacios ni signos', () => {
    expect(idValido(' 12')).toBeNull();
    expect(idValido('12 ')).toBeNull();
    expect(idValido('1_2')).toBeNull();
  });
});

describe('fechaValida', () => {
  it('acepta una fecha ISO', () => {
    const d = fechaValida('2026-08-25');
    expect(d).toBeInstanceOf(Date);
    expect(isNaN(d!.getTime())).toBe(false);
  });

  /** `new Date('abc')` es Invalid Date y en la consulta daba 500. */
  it('rechaza basura en vez de devolver Invalid Date', () => {
    expect(fechaValida('abc')).toBeNull();
    expect(fechaValida('2026-13-45')).toBeNull();
  });

  it('ausente es null, no error', () => {
    expect(fechaValida(null)).toBeNull();
    expect(fechaValida(undefined)).toBeNull();
    expect(fechaValida('')).toBeNull();
  });
});
