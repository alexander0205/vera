import { describe, it, expect } from 'vitest';
import { validarPartes, partesDeJson } from '@/lib/compras/pago-mixto';
import { partidasAsientoCompra, type ParametrosAsientoCompra } from '@/lib/compras/asiento-compra';

const cuentas = new Set([11, 12, 13]);

describe('validarPartes', () => {
  it('acepta partes que suman exactamente lo que se paga', () => {
    const r = validarPartes([
      { metodo: 'efectivo', cuentaSalidaId: 11, montoCents: 30_000 },
      { metodo: 'transferencia', cuentaSalidaId: 12, montoCents: 70_000 },
    ], 100_000, cuentas);
    expect(r.ok).toBe(true);
  });

  it('dice cuánto falta y cuánto sobra', () => {
    const falta = validarPartes([
      { metodo: 'efectivo', montoCents: 30_000 },
      { metodo: 'transferencia', montoCents: 50_000 },
    ], 100_000, cuentas);
    expect(falta).toMatchObject({ ok: false });
    expect((falta as { error: string }).error).toContain('faltan');
    const sobra = validarPartes([
      { metodo: 'efectivo', montoCents: 60_000 },
      { metodo: 'transferencia', montoCents: 60_000 },
    ], 100_000, cuentas);
    expect((sobra as { error: string }).error).toContain('sobran');
  });

  it('exige entre 2 y 6 partes', () => {
    expect(validarPartes([{ metodo: 'efectivo', montoCents: 100 }], 100, cuentas).ok).toBe(false);
    const siete = Array.from({ length: 7 }, (_, i) => ({ metodo: i % 2 ? 'efectivo' : 'cheque', cuentaSalidaId: null, montoCents: 100 }));
    expect(validarPartes(siete, 700, cuentas).ok).toBe(false);
    expect(validarPartes('no', 100, cuentas).ok).toBe(false);
  });

  it('rechaza métodos raros, montos no positivos o decimales y cuentas que no sueltan dinero', () => {
    const base = { metodo: 'efectivo', cuentaSalidaId: null };
    expect(validarPartes([{ ...base, montoCents: 50 }, { metodo: 'bitcoin', montoCents: 50 }], 100, cuentas).ok).toBe(false);
    expect(validarPartes([{ ...base, montoCents: 0 }, { metodo: 'cheque', montoCents: 100 }], 100, cuentas).ok).toBe(false);
    expect(validarPartes([{ ...base, montoCents: 50.5 }, { metodo: 'cheque', montoCents: 49.5 }], 100, cuentas).ok).toBe(false);
    expect(validarPartes([{ ...base, montoCents: 50 }, { metodo: 'cheque', cuentaSalidaId: 999, montoCents: 50 }], 100, cuentas).ok).toBe(false);
  });

  it('no deja repetir método y cuenta: serían una sola parte mal repartida', () => {
    const r = validarPartes([
      { metodo: 'efectivo', cuentaSalidaId: 11, montoCents: 50 },
      { metodo: 'efectivo', cuentaSalidaId: 11, montoCents: 50 },
    ], 100, cuentas);
    expect(r.ok).toBe(false);
  });
});

describe('partesDeJson', () => {
  it('devuelve las partes válidas y descarta lo que no tiene su forma', () => {
    expect(partesDeJson([
      { metodo: 'efectivo', cuentaSalidaId: 11, montoCents: 10 },
      { metodo: 'cheque', montoCents: 20 },
    ])).toEqual([
      { metodo: 'efectivo', cuentaSalidaId: 11, montoCents: 10 },
      { metodo: 'cheque', cuentaSalidaId: null, montoCents: 20 },
    ]);
    expect(partesDeJson(null)).toBeNull();
    expect(partesDeJson([{ metodo: 'efectivo', montoCents: 10 }])).toBeNull();
    expect(partesDeJson([{ metodo: 'x', montoCents: 10 }, { metodo: 'cheque', montoCents: 10 }])).toBeNull();
  });
});

describe('asiento de una compra pagada de forma mixta', () => {
  const params = (contrapartidas?: ParametrosAsientoCompra['cuentas']['contrapartidas']): ParametrosAsientoCompra => ({
    bases: [{ cuentaId: 61, baseCents: 100_000, descripcion: 'Gasto' }],
    itbisFacturadoCents: 18_000, itbisAlCostoCents: 0, iscCents: 0, otrosImpuestosCents: 0, propinaCents: 0,
    itbisRetenidoCents: 0, isrRetenidoCents: 0, esContado: true,
    cuentas: { itbisAdelantado: 14, itbisRetenido: null, isrRetenido: null, contrapartida: 11, contrapartidas },
  });
  const suma = (l: { debeCents: number; haberCents: number }[], k: 'debeCents' | 'haberCents') => l.reduce((s, x) => s + x[k], 0);

  it('acredita cada parte a su cuenta y cuadra', () => {
    const r = partidasAsientoCompra(params([
      { cuentaId: 11, cents: 18_000 }, { cuentaId: 12, cents: 100_000 },
    ]));
    if (!Array.isArray(r)) throw new Error('debía armar partidas');
    expect(r.filter((l) => l.haberCents > 0).map((l) => [l.cuentaId, l.haberCents])).toEqual([[11, 18_000], [12, 100_000]]);
    expect(suma(r, 'debeCents')).toBe(suma(r, 'haberCents'));
  });

  it('dos partes de la misma caja se ven como una sola línea', () => {
    const r = partidasAsientoCompra(params([
      { cuentaId: 11, cents: 50_000 }, { cuentaId: 11, cents: 68_000 },
    ]));
    if (!Array.isArray(r)) throw new Error('debía armar partidas');
    expect(r.filter((l) => l.haberCents > 0)).toHaveLength(1);
    expect(r.find((l) => l.cuentaId === 11)?.haberCents).toBe(118_000);
  });

  it('si las partes no suman lo que se paga, falla en voz alta en vez de mandar todo a una cuenta', () => {
    expect(() => partidasAsientoCompra(params([{ cuentaId: 12, cents: 1 }, { cuentaId: 13, cents: 1 }]))).toThrow(/no suma lo que se paga/);
  });
});
