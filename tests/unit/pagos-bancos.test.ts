import { describe, it, expect } from 'vitest';
import {
  bancoObligatorio, casarCuentaBanco, cuentaInicial, etiquetaDe, mismoBanco, normalizarBanco,
  resolverBancoDeAprobacion, ultimos4, MAX_ETIQUETA,
} from '@/lib/pagos/bancos';

/**
 * El banco de un cobro: reconocerlo por su nombre, casarlo con las cuentas del
 * colegio y decidir si hay que elegirlo antes de aprobar.
 *
 * Es lógica pura a propósito: la pantalla de aprobar un comprobante, la ruta que
 * lo aprueba y el selector de cobro comparten estas reglas, y una desviación
 * entre ellas se nota como un desplegable que dice una cosa y un servidor que
 * exige otra.
 */

describe('normalizarBanco', () => {
  it.each([
    ['Popular', 'popular'],
    ['Banco Popular Dominicano', 'popular'],
    ['BPD', 'popular'],
    ['bco. popular', 'popular'],
    ['BANCO POPULAR', 'popular'],
    ['BHD León', 'bhd'],
    ['Banco BHD', 'bhd'],
    ['Banreservas', 'banreservas'],
    ['Banco de Reservas de la República Dominicana', 'banreservas'],
    ['Scotiabank', 'scotiabank'],
    ['Scotia Bank', 'scotiabank'],
    ['Banco Santa Cruz', 'santa_cruz'],
    ['Promerica', 'promerica'],
    ['BDI', 'bdi'],
    ['Banco Caribe', 'caribe'],
    ['Vimenca', 'vimenca'],
    ['Banco López de Haro', 'lopez_de_haro'],
    ['Ademi', 'ademi'],
    ['APAP', 'apap'],
    ['Asociación Cibao', 'cibao'],
  ])('«%s» es %s', (texto, clave) => {
    expect(normalizarBanco(texto)?.clave).toBe(clave);
  });

  /** «Asociación Popular» (APAP) contiene «popular», pero NO es el Banco Popular. */
  it('Asociación Popular de Ahorros y Préstamos es APAP, no el Banco Popular', () => {
    expect(normalizarBanco('Asociación Popular de Ahorros y Préstamos')?.clave).toBe('apap');
    expect(normalizarBanco('Asociacion Popular')?.clave).toBe('apap');
  });

  it('busca el alias como palabra entera: «bdix» no es BDI', () => {
    expect(normalizarBanco('bdix')).toBeNull();
    expect(normalizarBanco('Banco BDI, S.A.')?.clave).toBe('bdi');
  });

  it('lo que no se reconoce o viene vacío es null', () => {
    expect(normalizarBanco('')).toBeNull();
    expect(normalizarBanco(null)).toBeNull();
    expect(normalizarBanco(undefined)).toBeNull();
    expect(normalizarBanco('Cooperativa de Maestros')).toBeNull();
  });

  /** Una cooperativa no es un banco de la lista, aunque su nombre lleve una de sus palabras. */
  it('«Cooperativa Popular de Maestros» no es el Banco Popular', () => {
    expect(normalizarBanco('Cooperativa Popular de Maestros')).toBeNull();
    expect(normalizarBanco('Coopnama')).toBeNull();
  });

  it('devuelve el nombre con el que se le enseña al usuario', () => {
    expect(normalizarBanco('bhd leon')?.nombre).toBe('Banco BHD');
  });
});

describe('mismoBanco', () => {
  it('dos escrituras del mismo banco son el mismo', () => {
    expect(mismoBanco('Popular', 'Banco Popular Dominicano')).toBe(true);
    expect(mismoBanco('BHD León', 'Banco BHD')).toBe(true);
  });

  it('bancos distintos no lo son', () => {
    expect(mismoBanco('Popular', 'BHD')).toBe(false);
    expect(mismoBanco('APAP', 'Banco Popular')).toBe(false);
  });

  it('un banco que no está en la lista se compara por su texto', () => {
    expect(mismoBanco('Banco Fihogar', 'Fihogar')).toBe(true);
    expect(mismoBanco('Banco Fihogar', 'Banco Agrícola')).toBe(false);
  });

  it('un banco raro que contiene «popular» no se confunde con el Popular', () => {
    expect(mismoBanco('Cooperativa Popular de Maestros', 'Banco Popular')).toBe(false);
  });

  it('textos demasiado cortos no casan con cualquier cosa', () => {
    expect(mismoBanco('Bco', 'Banco Fihogar')).toBe(false);
    expect(mismoBanco('', 'Popular')).toBe(false);
  });
});

describe('casarCuentaBanco', () => {
  const cuentas = [
    { id: 1, banco: 'Banco Popular Dominicano', ultimos4: '4821' },
    { id: 2, banco: 'Banco BHD', ultimos4: '9034' },
    { id: 3, banco: 'Banreservas', ultimos4: '1177' },
  ];

  it('casa por el nombre del banco aunque se escriba distinto', () => {
    expect(casarCuentaBanco({ banco: 'Popular' }, cuentas)).toBe(1);
    expect(casarCuentaBanco({ banco: 'BHD León' }, cuentas)).toBe(2);
    expect(casarCuentaBanco({ banco: 'Banco de Reservas' }, cuentas)).toBe(3);
  });

  it('un banco que el colegio no tiene no casa con nada', () => {
    expect(casarCuentaBanco({ banco: 'Scotiabank' }, cuentas)).toBeNull();
  });

  it('con dos cuentas del mismo banco desempatan los últimos 4 dígitos', () => {
    const dos = [
      { id: 10, banco: 'Banco Popular', ultimos4: '4821' },
      { id: 11, banco: 'Banco Popular', ultimos4: '7766' },
    ];
    expect(casarCuentaBanco({ banco: 'Popular', ultimos4: '7766' }, dos)).toBe(11);
    expect(casarCuentaBanco({ banco: 'Popular', ultimos4: '****4821' }, dos)).toBe(10);
  });

  it('con dos cuentas del mismo banco y sin dígitos NO elige: preseleccionar mal es peor que no hacerlo', () => {
    const dos = [
      { id: 10, banco: 'Banco Popular', ultimos4: '4821' },
      { id: 11, banco: 'Banco Popular', ultimos4: '7766' },
    ];
    expect(casarCuentaBanco({ banco: 'Popular' }, dos)).toBeNull();
    expect(casarCuentaBanco({ banco: 'Popular', ultimos4: '0000' }, dos)).toBeNull();
  });

  it('sin banco legible pero con los últimos 4 de UNA sola cuenta, es esa', () => {
    expect(casarCuentaBanco({ banco: null, ultimos4: '9034' }, cuentas)).toBe(2);
    expect(casarCuentaBanco({ banco: '  ', ultimos4: '1177' }, cuentas)).toBe(3);
  });

  it('sin nada que leer no hay cuenta', () => {
    expect(casarCuentaBanco({}, cuentas)).toBeNull();
    expect(casarCuentaBanco({ banco: 'Popular' }, [])).toBeNull();
  });
});

describe('cuentaInicial: qué banco viene marcado', () => {
  const dos = [
    { id: 1, banco: 'Banco Popular', ultimos4: '4821' },
    { id: 2, banco: 'Banco BHD', ultimos4: '9034' },
  ];

  it('con UNA sola cuenta es esa, lea lo que lea la IA', () => {
    expect(cuentaInicial([dos[0]], null)).toBe(1);
    expect(cuentaInicial([dos[0]], { banco: 'BHD' })).toBe(1);
  });

  it('con varias, la que casa con lo que leyó la IA', () => {
    expect(cuentaInicial(dos, { banco: 'BHD León' })).toBe(2);
  });

  it('con varias y sin lectura, ninguna', () => {
    expect(cuentaInicial(dos, null)).toBeNull();
    expect(cuentaInicial(dos, { banco: 'Scotiabank' })).toBeNull();
  });

  it('sin cuentas, ninguna', () => {
    expect(cuentaInicial([], { banco: 'Popular' })).toBeNull();
  });
});

describe('bancoObligatorio', () => {
  it('transferencia o depósito con VARIAS cuentas: hay que elegir', () => {
    expect(bancoObligatorio('transferencia', 2)).toBe(true);
    expect(bancoObligatorio('deposito', 3)).toBe(true);
    expect(bancoObligatorio(' Transferencia ', 2)).toBe(true);
  });

  it('con una sola cuenta no hay nada que elegir', () => {
    expect(bancoObligatorio('transferencia', 1)).toBe(false);
  });

  it('sin cuentas cargadas nadie queda bloqueado por falta de configuración', () => {
    expect(bancoObligatorio('transferencia', 0)).toBe(false);
  });

  it('el efectivo y la tarjeta no piden banco', () => {
    expect(bancoObligatorio('efectivo', 3)).toBe(false);
    expect(bancoObligatorio('tarjeta', 3)).toBe(false);
  });
});

describe('resolverBancoDeAprobacion: lo que acepta el servidor', () => {
  const cuentas = [
    { id: 1, activa: true },
    { id: 2, activa: true },
    { id: 3, activa: false },
  ];

  it('una cuenta del equipo se acepta', () => {
    expect(resolverBancoDeAprobacion({ cuentaBancoId: 2, metodo: 'transferencia', cuentas }))
      .toEqual({ ok: true, cuentaId: 2 });
  });

  /** El id viaja desde el navegador: sin esto se ataría el cobro a la cuenta de OTRA empresa. */
  it('una cuenta que NO es del equipo se rechaza', () => {
    const r = resolverBancoDeAprobacion({ cuentaBancoId: 99, metodo: 'transferencia', cuentas });
    expect(r).toEqual({ ok: false, error: 'Esa cuenta bancaria no es de este colegio.' });
  });

  it('una cuenta apagada se acepta (un depósito viejo pudo entrar a una cuenta ya cerrada)', () => {
    expect(resolverBancoDeAprobacion({ cuentaBancoId: 3, metodo: 'deposito', cuentas }))
      .toEqual({ ok: true, cuentaId: 3 });
  });

  it('transferencia sin banco y con varias cuentas activas: falta elegirlo', () => {
    const r = resolverBancoDeAprobacion({ cuentaBancoId: null, metodo: 'transferencia', cuentas });
    expect(r).toEqual({ ok: false, error: 'Elige el banco donde entró el dinero.' });
  });

  it('las apagadas no cuentan para decidir si hay que elegir', () => {
    const una = [{ id: 1, activa: true }, { id: 3, activa: false }];
    expect(resolverBancoDeAprobacion({ cuentaBancoId: undefined, metodo: 'transferencia', cuentas: una }))
      .toEqual({ ok: true, cuentaId: null });
  });

  it('sin cuentas cargadas se aprueba como siempre', () => {
    expect(resolverBancoDeAprobacion({ cuentaBancoId: undefined, metodo: 'transferencia', cuentas: [] }))
      .toEqual({ ok: true, cuentaId: null });
  });

  it('en efectivo no se exige banco', () => {
    expect(resolverBancoDeAprobacion({ cuentaBancoId: undefined, metodo: 'efectivo', cuentas }))
      .toEqual({ ok: true, cuentaId: null });
  });
});

describe('etiquetas de cuenta', () => {
  it('los últimos 4 ignoran guiones y espacios', () => {
    expect(ultimos4('000-1234-5678-4821')).toBe('4821');
    expect(ultimos4('12')).toBeNull();
    expect(ultimos4(null)).toBeNull();
  });

  it('arma «Banco · Tipo ····1234»', () => {
    expect(etiquetaDe('Banco Popular', 'Ahorros', '4821')).toBe('Banco Popular · Ahorros ····4821');
    expect(etiquetaDe('Banreservas', null, null)).toBe('Banreservas');
  });

  it('recorta el nombre, nunca los últimos dígitos, para caber en varchar(100)', () => {
    const largo = etiquetaDe('B'.repeat(150), 'Corriente', '4821');
    expect(largo.length).toBeLessThanOrEqual(MAX_ETIQUETA);
    expect(largo.endsWith('····4821')).toBe(true);
  });
});
