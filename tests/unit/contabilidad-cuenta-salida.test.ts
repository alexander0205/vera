import { describe, it, expect } from 'vitest';
import { cuentasDeMetodos, elegirCuentaSalida, esCuentaDeSalida } from '@/lib/contabilidad/cuenta-salida';
import type { CuentaCatalogo } from '@/lib/contabilidad/cuenta-gasto';

const cuenta = (id: number, codigo: string): CuentaCatalogo => ({ id, codigo, nombre: `Cuenta ${codigo}` });

// El catálogo de un contador: dos cajas, dos bancos, y una línea de crédito que
// en el catálogo base es «Sueldos por pagar» con el mismo código.
const CAJA     = cuenta(1, '110101');
const CHICA    = cuenta(2, '110102');
const BHD      = cuenta(3, '110201');
const RESERVAS = cuenta(4, '110202');
const LIQUIDAR = cuenta(5, '1106');
const LINEA    = cuenta(6, '210501');
const VENTAS   = cuenta(7, '4101');
const GASTO    = cuenta(8, '6114');

describe('qué cuenta puede soltar dinero', () => {
  it('caja, bancos y cobros por liquidar, con sus subcuentas', () => {
    for (const c of [CAJA, CHICA, BHD, RESERVAS, LIQUIDAR]) expect(esCuentaDeSalida(c)).toBe(true);
  });

  it('un ingreso o un gasto no, aunque el asiento cuadre igual', () => {
    expect(esCuentaDeSalida(VENTAS)).toBe(false);
    expect(esCuentaDeSalida(GASTO)).toBe(false);
  });

  it('un pasivo solo si la empresa lo puso como cuenta de un método', () => {
    expect(esCuentaDeSalida(LINEA)).toBe(false);
    expect(esCuentaDeSalida(LINEA, new Set([LINEA.id]))).toBe(true);
  });

  it('las cuentas de los métodos que no mueven dinero no cuentan', () => {
    const ids = cuentasDeMetodos([
      { clave: 'tarjeta', cuentaId: LINEA.id },
      { clave: 'nota_credito', cuentaId: VENTAS.id },
      { clave: 'saldo_favor', cuentaId: GASTO.id },
    ]);
    expect([...ids]).toEqual([LINEA.id]);
  });
});

describe('de qué cuenta sale el dinero de un gasto', () => {
  const salida = new Map([CAJA, CHICA, BHD, RESERVAS].map((c) => [c.id, c]));

  it('sin elegir nada, la del método de pago', () => {
    expect(elegirCuentaSalida({ delMetodoId: BHD.id, salida })).toEqual({ cuenta: BHD, origen: 'metodo' });
  });

  it('la elegida en el comprobante manda sobre la del método', () => {
    expect(elegirCuentaSalida({ elegidaId: RESERVAS.id, delMetodoId: BHD.id, salida }))
      .toEqual({ cuenta: RESERVAS, origen: 'comprobante' });
  });

  it('una cuenta que desactivaron después se salta: el asiento sale por el método', () => {
    expect(elegirCuentaSalida({ elegidaId: 99, delMetodoId: BHD.id, salida }))
      .toEqual({ cuenta: BHD, origen: 'metodo' });
  });

  it('sin método configurado y sin elegir, no se inventa ninguna', () => {
    expect(elegirCuentaSalida({ salida })).toBeNull();
    expect(elegirCuentaSalida({ elegidaId: null, delMetodoId: null, salida })).toBeNull();
  });
});
