import { describe, it, expect } from 'vitest';
import { partesDeJson, validarPartes } from '@/lib/compras/pago-mixto';
import { partidasAsientoCompra } from '@/lib/compras/asiento-compra';
import { formaPago606 } from '@/lib/compras/fiscal';

const CUENTAS = new Set([10, 11, 12]);
const ok = (partes: unknown, neto: number) => validarPartes(partes, neto, CUENTAS);
const error = (partes: unknown, neto: number) => {
  const r = ok(partes, neto);
  expect(r.ok).toBe(false);
  return r.ok ? '' : r.error;
};

describe('validarPartes (pago mixto)', () => {
  const dos = [
    { metodo: 'efectivo', cuentaSalidaId: 10, montoCents: 60_000 },
    { metodo: 'transferencia', cuentaSalidaId: 11, montoCents: 40_000 },
  ];

  it('acepta partes que suman exactamente lo que se paga', () => {
    const r = ok(dos, 100_000);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.partes).toHaveLength(2);
  });
  it('la cuenta puede quedar vacía: se usa la del método', () => {
    expect(ok([{ metodo: 'efectivo', montoCents: 50 }, { metodo: 'tarjeta', cuentaSalidaId: null, montoCents: 50 }], 100).ok).toBe(true);
  });
  it('dice cuánto falta o sobra', () => {
    expect(error(dos, 100_001)).toMatch(/faltan RD\$0\.01/);
    expect(error(dos, 99_999)).toMatch(/sobran RD\$0\.01/);
  });
  it('una sola parte, ninguna o más de 6 no es un pago mixto', () => {
    expect(error([dos[0]], 60_000)).toMatch(/al menos 2/);
    expect(error([], 0)).toMatch(/al menos 2/);
    expect(error(Array.from({ length: 7 }, (_, i) => ({ metodo: i % 2 ? 'efectivo' : 'cheque', cuentaSalidaId: i < 3 ? [10, 11, 12][i] : null, montoCents: 10 })), 70)).toMatch(/no pasa de 6/);
  });
  it('rechaza lo que no es una lista, métodos raros, montos malos y cuentas ajenas', () => {
    for (const v of [null, undefined, 'x', 5, {}]) expect(error(v, 100)).toMatch(/necesita sus partes/);
    expect(error([{ metodo: 'mixto', montoCents: 50 }, dos[1]], 90)).toMatch(/Parte 1/);
    expect(error([{ metodo: 'bitcoin', montoCents: 50 }, dos[1]], 90)).toMatch(/Parte 1/);
    for (const montoCents of [0, -5, 1.5, NaN, '50', null]) expect(error([{ metodo: 'efectivo', cuentaSalidaId: 10, montoCents }, dos[1]], 100)).toMatch(/Parte 1.*monto/);
    expect(error([dos[0], { metodo: 'cheque', cuentaSalidaId: 999, montoCents: 40_000 }], 100_000)).toMatch(/Parte 2.*no puede salir dinero/);
    expect(error([dos[0], { metodo: 'cheque', cuentaSalidaId: '11', montoCents: 40_000 }], 100_000)).toMatch(/Parte 2/);
    expect(error([null, dos[1]], 100)).toMatch(/Parte 1/);
  });
  it('rechaza dos partes iguales (mismo método y misma cuenta)', () => {
    expect(error([dos[0], { ...dos[0], montoCents: 40_000 }], 100_000)).toMatch(/repite/);
  });
  it('mismo método en cuentas distintas sí vale (dos bancos)', () => {
    expect(ok([{ metodo: 'transferencia', cuentaSalidaId: 10, montoCents: 30 }, { metodo: 'transferencia', cuentaSalidaId: 11, montoCents: 70 }], 100).ok).toBe(true);
  });
});

describe('partesDeJson', () => {
  it('lee lo guardado y descarta lo que no tiene forma de pago mixto', () => {
    expect(partesDeJson([{ metodo: 'efectivo', cuentaSalidaId: 1, montoCents: 5 }, { metodo: 'cheque', montoCents: 5 }])).toEqual([
      { metodo: 'efectivo', cuentaSalidaId: 1, montoCents: 5 }, { metodo: 'cheque', cuentaSalidaId: null, montoCents: 5 },
    ]);
    for (const v of [null, undefined, 'x', [], [{ metodo: 'efectivo', montoCents: 5 }], [{ metodo: 'x', montoCents: 5 }, { metodo: 'efectivo', montoCents: 5 }]]) {
      expect(partesDeJson(v)).toBeNull();
    }
  });
});

describe('asiento de una compra con pago mixto', () => {
  const base = {
    bases: [{ cuentaId: 100, baseCents: 100_000, descripcion: 'Papelería' }],
    itbisFacturadoCents: 18_000, itbisAlCostoCents: 0, iscCents: 0, otrosImpuestosCents: 0, propinaCents: 0,
    itbisRetenidoCents: 0, isrRetenidoCents: 0, esContado: true,
    cuentas: { itbisAdelantado: 104, itbisRetenido: null, isrRetenido: null, contrapartida: 200 },
  };
  const debe = (ls: { debeCents: number }[]) => ls.reduce((s, l) => s + l.debeCents, 0);
  const haber = (ls: { haberCents: number }[]) => ls.reduce((s, l) => s + l.haberCents, 0);

  it('cada parte sale de su cuenta y el asiento cuadra', () => {
    const r = partidasAsientoCompra({ ...base, cuentas: { ...base.cuentas, contrapartidas: [{ cuentaId: 10, cents: 78_000 }, { cuentaId: 11, cents: 40_000 }] } });
    expect(Array.isArray(r)).toBe(true);
    if (!Array.isArray(r)) return;
    expect(r.find((l) => l.cuentaId === 10)?.haberCents).toBe(78_000);
    expect(r.find((l) => l.cuentaId === 11)?.haberCents).toBe(40_000);
    expect(r.find((l) => l.cuentaId === 200)).toBeUndefined();
    expect(debe(r)).toBe(haber(r));
  });
  it('dos partes de la misma cuenta se juntan en una línea', () => {
    const r = partidasAsientoCompra({ ...base, cuentas: { ...base.cuentas, contrapartidas: [{ cuentaId: 10, cents: 50_000 }, { cuentaId: 10, cents: 68_000 }] } });
    if (!Array.isArray(r)) throw new Error('motivo');
    expect(r.filter((l) => l.cuentaId === 10)).toHaveLength(1);
    expect(r.find((l) => l.cuentaId === 10)?.haberCents).toBe(118_000);
  });
  it('con retenciones se reparte lo que de verdad se paga (total − retenciones)', () => {
    const r = partidasAsientoCompra({
      ...base, itbisRetenidoCents: 6_000, isrRetenidoCents: 10_000,
      cuentas: { ...base.cuentas, itbisRetenido: 300, isrRetenido: 301, contrapartidas: [{ cuentaId: 10, cents: 70_000 }, { cuentaId: 11, cents: 32_000 }] },
    });
    if (!Array.isArray(r)) throw new Error('motivo');
    expect(debe(r)).toBe(haber(r));
    expect(r.find((l) => l.cuentaId === 300)?.haberCents).toBe(6_000);
  });
  it('si las partes no suman lo que se paga, no inventa un asiento descuadrado: cae a la cuenta única', () => {
    const r = partidasAsientoCompra({ ...base, cuentas: { ...base.cuentas, contrapartidas: [{ cuentaId: 10, cents: 1 }] } });
    if (!Array.isArray(r)) throw new Error('motivo');
    expect(r.find((l) => l.cuentaId === 200)?.haberCents).toBe(118_000);
    expect(debe(r)).toBe(haber(r));
  });
  it('a crédito ignora las partes: la deuda va a cuentas por pagar', () => {
    const r = partidasAsientoCompra({ ...base, esContado: false, cuentas: { ...base.cuentas, contrapartidas: [{ cuentaId: 10, cents: 118_000 }] } });
    if (!Array.isArray(r)) throw new Error('motivo');
    expect(r.find((l) => l.cuentaId === 200)?.haberCents).toBe(118_000);
    expect(r.find((l) => l.cuentaId === 10)).toBeUndefined();
  });
  it('en el 606 un pago mixto es forma de pago 7', () => {
    expect(formaPago606('contado', 'mixto')).toBe('7');
    expect(formaPago606('credito', 'mixto')).toBe('4');
  });
});
