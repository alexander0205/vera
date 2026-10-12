import { describe, it, expect } from 'vitest';
import {
  armarMovimiento, celdaCsv, fechaMovimientoValida, MovimientoBancarioError, textoLibre,
  type InfoCuenta, type MovimientoBancario,
} from '@/lib/contabilidad/bancos';

const HOY = '2026-10-09';
const c = (id: number, codigo: string, nombre: string, tipo: string, extra: Partial<InfoCuenta> = {}): InfoCuenta =>
  ({ id, codigo, nombre, tipo, imputable: true, activa: true, ...extra });

const CAJA = c(1, '110101', 'Caja General', 'activo');
const BHD = c(2, '110201', 'Banco BHD', 'activo');
const RES = c(3, '110202', 'Banco de Reservas', 'activo');
const GASTO = c(10, '610215', 'Cargos bancarios', 'gasto');
const CXC = c(20, '110301', 'Cuentas por cobrar clientes', 'activo');
const PASIVO = c(30, '2199', 'Depósitos por identificar', 'pasivo');
const GRUPO = c(40, '6102', 'Gastos generales', 'gasto', { imputable: false });
const INACTIVA = c(41, '610999', 'Vieja', 'gasto', { activa: false });

const SALIDA = new Map([CAJA, BHD, RES].map((x) => [x.id, x]));
const TODAS = new Map([CAJA, BHD, RES, GASTO, CXC, PASIVO, GRUPO, INACTIVA].map((x) => [x.id, x]));
const armar = (m: MovimientoBancario) => armarMovimiento(m, SALIDA, TODAS, HOY);
const debe = (ls: { debeCents: number }[]) => ls.reduce((s, l) => s + l.debeCents, 0);
const haber = (ls: { haberCents: number }[]) => ls.reduce((s, l) => s + l.haberCents, 0);
const falla = (m: MovimientoBancario, re: RegExp) => {
  expect(() => armar(m)).toThrow(MovimientoBancarioError);
  expect(() => armar(m)).toThrow(re);
};

describe('transferencia entre cuentas propias', () => {
  const t: MovimientoBancario = { kind: 'transferencia', fecha: HOY, cuentaOrigenId: 2, cuentaDestinoId: 3, montoCents: 500_000, referencia: 'TRF-123' };

  it('debita el destino y acredita el origen, y cuadra', () => {
    const r = armar(t);
    expect(r.lineas).toEqual([
      expect.objectContaining({ cuentaId: 3, debeCents: 500_000, haberCents: 0 }),
      expect.objectContaining({ cuentaId: 2, debeCents: 0, haberCents: 500_000 }),
    ]);
    expect(debe(r.lineas)).toBe(haber(r.lineas));
    expect(r.concepto).toContain('Banco BHD → Banco de Reservas');
    expect(r.concepto).toContain('TRF-123');
  });
  it('rechaza origen igual a destino y cuentas que no son caja o banco', () => {
    falla({ ...t, cuentaDestinoId: 2 }, /misma cuenta/);
    falla({ ...t, cuentaDestinoId: 10 }, /caja o un banco/);
    falla({ ...t, cuentaOrigenId: 999 }, /caja o un banco/);
    falla({ ...t, cuentaOrigenId: NaN }, /caja o un banco/);
  });
});

describe('cargo bancario', () => {
  const k: MovimientoBancario = { kind: 'cargo', fecha: HOY, cuentaId: 2, cuentaGastoId: 10, montoCents: 15_000 };
  it('debita el gasto y acredita el banco', () => {
    const r = armar(k);
    expect(r.lineas[0]).toMatchObject({ cuentaId: 10, debeCents: 15_000 });
    expect(r.lineas[1]).toMatchObject({ cuentaId: 2, haberCents: 15_000 });
    expect(debe(r.lineas)).toBe(haber(r.lineas));
  });
  it('la cuenta de gasto tiene que ser de gasto, de detalle y activa', () => {
    falla({ ...k, cuentaGastoId: 20 }, /no es una cuenta de gasto/);
    falla({ ...k, cuentaGastoId: 40 }, /grupo/);
    falla({ ...k, cuentaGastoId: 41 }, /desactivada/);
    falla({ ...k, cuentaGastoId: 999 }, /no existe/);
  });
});

describe('depósito y retiro', () => {
  it('un depósito debita el banco y acredita la contrapartida', () => {
    const r = armar({ kind: 'deposito', fecha: HOY, cuentaId: 2, contrapartidaId: 30, montoCents: 1_000_000, concepto: 'Depósito sin identificar' });
    expect(r.lineas[0]).toMatchObject({ cuentaId: 2, debeCents: 1_000_000 });
    expect(r.lineas[1]).toMatchObject({ cuentaId: 30, haberCents: 1_000_000 });
  });
  it('un retiro es lo inverso', () => {
    const r = armar({ kind: 'retiro', fecha: HOY, cuentaId: 1, contrapartidaId: 20, montoCents: 250_000 });
    expect(r.lineas[0]).toMatchObject({ cuentaId: 20, debeCents: 250_000 });
    expect(r.lineas[1]).toMatchObject({ cuentaId: 1, haberCents: 250_000 });
  });
  it('no deja usar otra caja o banco como contrapartida (eso es una transferencia)', () => {
    falla({ kind: 'deposito', fecha: HOY, cuentaId: 2, contrapartidaId: 3, montoCents: 100 }, /Transferencia entre cuentas/);
    falla({ kind: 'deposito', fecha: HOY, cuentaId: 2, contrapartidaId: 2, montoCents: 100 }, /misma/);
    falla({ kind: 'retiro', fecha: HOY, cuentaId: 2, contrapartidaId: 40, montoCents: 100 }, /grupo/);
    falla({ kind: 'retiro', fecha: HOY, cuentaId: 20, contrapartidaId: 30, montoCents: 100 }, /caja o un banco/);
  });
});

describe('montos y fechas (errores humanos)', () => {
  const base = { kind: 'cargo', cuentaId: 2, cuentaGastoId: 10 } as const;
  it('monto cero, negativo, fraccionario o enorme', () => {
    for (const montoCents of [0, -5, 1.5, NaN, Infinity, 10_000_000_001]) {
      expect(() => armar({ ...base, fecha: HOY, montoCents })).toThrow(MovimientoBancarioError);
    }
    expect(() => armar({ ...base, fecha: HOY, montoCents: 10_000_000_000 })).not.toThrow();
  });
  it('fechas imposibles, antiguas o muy a futuro', () => {
    for (const fecha of ['2026-02-30', '1999-12-31', '2026-13-01', 'ayer', '', '2026-1-1', '2027-10-09']) {
      expect(() => armar({ ...base, fecha, montoCents: 100 })).toThrow(/fecha/);
    }
    expect(fechaMovimientoValida('2026-11-09', HOY)).toBe(true);
    expect(fechaMovimientoValida('2026-11-10', HOY)).toBe(false);
    expect(fechaMovimientoValida('2028-02-29', '2028-02-01')).toBe(true);
  });
});

describe('texto libre y CSV', () => {
  it('limpia controles y recorta', () => {
    expect(textoLibre('  a\u0000b‮  c ', 50)).toBe('ab c');
    expect(textoLibre('x'.repeat(300), 80)).toHaveLength(80);
    for (const v of [null, 5, '', '  ', '\u0000']) expect(textoLibre(v, 10)).toBeNull();
  });
  it('un concepto con HTML o fórmula no rompe el asiento', () => {
    const r = armar({ kind: 'cargo', fecha: HOY, cuentaId: 2, cuentaGastoId: 10, montoCents: 100, concepto: '=CMD()<script>' });
    expect(r.concepto.length).toBeLessThanOrEqual(255);
  });
  it('celdaCsv neutraliza fórmulas y escapa comillas, comas y saltos de línea', () => {
    expect(celdaCsv('=1+1')).toBe("\"'=1+1\"");
    expect(celdaCsv('+cmd')).toBe("\"'+cmd\"");
    expect(celdaCsv('@SUM(A1)')).toBe("\"'@SUM(A1)\"");
    expect(celdaCsv('-2+3')).toBe("\"'-2+3\"");
    expect(celdaCsv('hola, "mundo"')).toBe('"hola, ""mundo"""');
    expect(celdaCsv('a\nb')).toBe('"a\nb"');
    expect(celdaCsv('normal')).toBe('normal');
    expect(celdaCsv(1234.5)).toBe('1234.5');
    expect(celdaCsv(null)).toBe('');
    expect(celdaCsv(-5)).toBe('-5');
  });
});
