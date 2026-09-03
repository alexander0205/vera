// tests/unit/comprador-rnc.test.ts
import { describe, it, expect } from 'vitest';
import { datosComprador } from '@/app/(dashboard)/dashboard/facturas/nueva/utils/comprador';

const cliente = (rnc: string | null, razonSocial = 'María Pérez') => ({ rnc, razonSocial });

describe('datosComprador', () => {
  it('sin contacto, manda lo escrito a mano', () => {
    expect(datosComprador(null, '131234567', 'Ferretería Del Sur'))
      .toEqual({ rnc: '131234567', razonSocial: 'Ferretería Del Sur' });
  });

  it('con contacto y sin nada escrito, manda el contacto', () => {
    // El formulario siembra `rncManual` con el RNC del contacto al elegirlo, así
    // que en el caso corriente los dos dicen lo mismo; esto cubre el camino en
    // que no llegó a sembrarse (editar un borrador viejo).
    expect(datosComprador(cliente('40212345678'), '', ''))
      .toEqual({ rnc: '40212345678', razonSocial: 'María Pérez' });
  });

  /**
   * El caso que motivó todo esto: el padre paga la colegiatura de su hijo y
   * pide la factura a nombre de su empresa. El contacto —y por tanto el cargo,
   * el alumno y el cobro— sigue siendo él; lo único que cambia es el RNC
   * impreso. Antes ganaba siempre el contacto y lo escrito se tiraba en
   * silencio.
   */
  it('con contacto Y RNC escrito, gana el escrito', () => {
    expect(datosComprador(cliente('40212345678'), '131234567', 'Ferretería Del Sur'))
      .toEqual({ rnc: '131234567', razonSocial: 'Ferretería Del Sur' });
  });

  it('un RNC escrito sin nombre no arrastra el nombre del contacto a otra cédula', () => {
    // Sin razón social propia se queda la del contacto, que es el dueño de la
    // factura; el RNC sí cambia. Es el caso de corregir una cédula mal tecleada.
    expect(datosComprador(cliente('40212345678'), '00112345678', ''))
      .toEqual({ rnc: '00112345678', razonSocial: 'María Pérez' });
  });

  it('espacios en blanco no cuentan como valor escrito', () => {
    expect(datosComprador(cliente('40212345678'), '   ', '  '))
      .toEqual({ rnc: '40212345678', razonSocial: 'María Pérez' });
  });

  it('contacto sin RNC y nada escrito → vacío, no la cadena "null"', () => {
    expect(datosComprador(cliente(null), '', '')).toEqual({ rnc: '', razonSocial: 'María Pérez' });
  });
});
