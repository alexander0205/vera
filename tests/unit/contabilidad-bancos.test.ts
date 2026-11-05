import { describe, it, expect } from 'vitest';
import {
  armarMovimiento, celdaCsv, fechaMovimientoValida, textoLibre, MovimientoBancarioError,
  type InfoCuenta, type MovimientoBancario,
} from '@/lib/contabilidad/bancos';

const c = (id: number, codigo: string, nombre: string, tipo = 'activo', extra: Partial<InfoCuenta> = {}): InfoCuenta =>
  ({ id, codigo, nombre, tipo, imputable: true, activa: true, ...extra });

const caja = c(1, '1101', 'Caja');
const bancoA = c(2, '110201', 'Banco A');
const bancoB = c(3, '110202', 'Banco B');
const gastoBanco = c(10, '6117', 'Gastos financieros', 'gasto');
const ventas = c(20, '4104', 'Ingresos por servicios', 'ingreso');
const grupo = c(30, '61', 'Gastos operacionales', 'gasto', { imputable: false });
const gastoApagado = c(31, '6199', 'Vieja', 'gasto', { activa: false });

const salida = new Map([caja, bancoA, bancoB].map((x) => [x.id, x]));
const todas = new Map([caja, bancoA, bancoB, gastoBanco, ventas, grupo, gastoApagado].map((x) => [x.id, x]));
const HOY = '2026-11-04';

const armar = (m: MovimientoBancario) => armarMovimiento(m, salida, todas, HOY);
const suma = (l: { debeCents: number; haberCents: number }[], k: 'debeCents' | 'haberCents') => l.reduce((s, x) => s + x[k], 0);

describe('depósito de la caja al banco (transferencia entre cuentas propias)', () => {
  const r = armar({ kind: 'transferencia', fecha: '2026-11-03', cuentaOrigenId: 1, cuentaDestinoId: 2, montoCents: 250_000 });

  it('debita el banco, acredita la caja y cuadra', () => {
    expect(r.lineas.find((l) => l.cuentaId === 2)?.debeCents).toBe(250_000);
    expect(r.lineas.find((l) => l.cuentaId === 1)?.haberCents).toBe(250_000);
    expect(suma(r.lineas, 'debeCents')).toBe(suma(r.lineas, 'haberCents'));
  });

  it('no toca ninguna cuenta de gasto ni de ingreso', () => {
    expect(r.lineas.map((l) => l.cuentaId).sort()).toEqual([1, 2]);
  });

  it('rechaza el mismo origen y destino, y cuentas que no son caja ni banco', () => {
    expect(() => armar({ kind: 'transferencia', fecha: '2026-11-03', cuentaOrigenId: 2, cuentaDestinoId: 2, montoCents: 1 })).toThrow(MovimientoBancarioError);
    expect(() => armar({ kind: 'transferencia', fecha: '2026-11-03', cuentaOrigenId: 2, cuentaDestinoId: 10, montoCents: 1 })).toThrow(/caja o un banco/);
  });
});

describe('cargo bancario', () => {
  it('es gasto contra el banco', () => {
    const r = armar({ kind: 'cargo', fecha: '2026-11-03', cuentaId: 2, cuentaGastoId: 10, montoCents: 1_500, concepto: 'Impuesto por transferencia' });
    expect(r.lineas.find((l) => l.cuentaId === 10)?.debeCents).toBe(1_500);
    expect(r.lineas.find((l) => l.cuentaId === 2)?.haberCents).toBe(1_500);
  });

  it('exige una cuenta de gasto activa y de detalle', () => {
    expect(() => armar({ kind: 'cargo', fecha: '2026-11-03', cuentaId: 2, cuentaGastoId: 20, montoCents: 1 })).toThrow(/no es una cuenta de gasto/);
    expect(() => armar({ kind: 'cargo', fecha: '2026-11-03', cuentaId: 2, cuentaGastoId: 30, montoCents: 1 })).toThrow(/grupo/);
    expect(() => armar({ kind: 'cargo', fecha: '2026-11-03', cuentaId: 2, cuentaGastoId: 31, montoCents: 1 })).toThrow(/desactivada/);
  });
});

describe('depósito y retiro contra una cuenta que no es caja ni banco', () => {
  it('el depósito debita el banco y acredita la contrapartida', () => {
    const r = armar({ kind: 'deposito', fecha: '2026-11-03', cuentaId: 2, contrapartidaId: 20, montoCents: 900 });
    expect(r.lineas.find((l) => l.cuentaId === 2)).toMatchObject({ debeCents: 900, haberCents: 0 });
    expect(r.lineas.find((l) => l.cuentaId === 20)).toMatchObject({ debeCents: 0, haberCents: 900 });
  });

  it('el retiro hace lo contrario', () => {
    const r = armar({ kind: 'retiro', fecha: '2026-11-03', cuentaId: 2, contrapartidaId: 10, montoCents: 900 });
    expect(r.lineas.find((l) => l.cuentaId === 2)).toMatchObject({ debeCents: 0, haberCents: 900 });
    expect(r.lineas.find((l) => l.cuentaId === 10)).toMatchObject({ debeCents: 900, haberCents: 0 });
  });

  it('mover entre dos cajas o bancos se manda a «transferencia»', () => {
    expect(() => armar({ kind: 'deposito', fecha: '2026-11-03', cuentaId: 2, contrapartidaId: 1, montoCents: 1 })).toThrow(/Transferencia/);
  });
});

describe('validaciones comunes', () => {
  const base = { kind: 'transferencia', cuentaOrigenId: 1, cuentaDestinoId: 2 } as const;
  it('monto positivo, entero y con tope', () => {
    for (const montoCents of [0, -5, 1.5, NaN, 10_000_000_001]) {
      expect(() => armar({ ...base, fecha: '2026-11-03', montoCents })).toThrow(MovimientoBancarioError);
    }
  });
  it('fecha real, desde 2000 y hasta 31 días a futuro', () => {
    expect(fechaMovimientoValida('2026-11-04', HOY)).toBe(true);
    expect(fechaMovimientoValida('2026-12-05', HOY)).toBe(true);
    expect(fechaMovimientoValida('2026-12-06', HOY)).toBe(false);
    expect(fechaMovimientoValida('2026-02-30', HOY)).toBe(false);
    expect(fechaMovimientoValida('1999-12-31', HOY)).toBe(false);
    expect(fechaMovimientoValida('04/11/2026', HOY)).toBe(false);
    expect(fechaMovimientoValida(20261104, HOY)).toBe(false);
  });
});

describe('texto y CSV', () => {
  it('textoLibre quita caracteres de control y recorta', () => {
    expect(textoLibre('  hola\u0000   mundo  ', 20)).toBe('hola mundo');
    expect(textoLibre('abcdef', 3)).toBe('abc');
    expect(textoLibre('   ', 10)).toBeNull();
    expect(textoLibre(5, 10)).toBeNull();
  });
  it('celdaCsv neutraliza fórmulas y escapa comillas', () => {
    expect(celdaCsv('=SUMA(A1)')).toBe(`"'=SUMA(A1)"`);
    expect(celdaCsv('-5')).toBe('-5');            // un monto negativo es un número, no una fórmula
    expect(celdaCsv('-12.50')).toBe('-12.50');
    expect(celdaCsv(-12.5)).toBe('-12.5');
    expect(celdaCsv('-cmd|calc')).toBe(`"'-cmd|calc"`);
    expect(celdaCsv('dijo "hola"')).toBe('"dijo ""hola"""');
    expect(celdaCsv('a;b')).toBe('"a;b"');
    expect(celdaCsv(1234)).toBe('1234');
    expect(celdaCsv(null)).toBe('');
  });
});

describe('G · contrapartida de depósito y retiro', () => {
  const cxc = c(40, '1103', 'Cuentas por cobrar');
  const cxp = c(41, '2101', 'Cuentas por pagar', 'pasivo');
  const porIdentificar = c(42, '2115', 'Depósitos por identificar', 'pasivo');
  const propia = c(43, '2150', 'Cuenta propia configurada', 'pasivo');
  const todasG = new Map([...todas.values(), cxc, cxp, porIdentificar, propia].map((x) => [x.id, x]));
  const armarG = (m: MovimientoBancario, excluidas = new Set<number>()) => armarMovimiento(m, salida, todasG, HOY, excluidas);

  it.each([[40], [41], [42]])('un depósito contra la cuenta %i (con auxiliar) se rechaza', (id) => {
    expect(() => armarG({ kind: 'deposito', fecha: '2026-11-03', cuentaId: 2, contrapartidaId: id, montoCents: 100 })).toThrow(/auxiliar/);
    expect(() => armarG({ kind: 'retiro', fecha: '2026-11-03', cuentaId: 2, contrapartidaId: id, montoCents: 100 })).toThrow(/auxiliar/);
  });

  it('también se rechazan las cuentas que la empresa configuró para esos usos, aunque tengan otro código', () => {
    expect(() => armarG({ kind: 'deposito', fecha: '2026-11-03', cuentaId: 2, contrapartidaId: 43, montoCents: 100 }, new Set([43]))).toThrow(/auxiliar/);
    expect(armarG({ kind: 'deposito', fecha: '2026-11-03', cuentaId: 2, contrapartidaId: 43, montoCents: 100 }).lineas).toHaveLength(2);
  });

  it('una cuenta de ingreso o de gasto sigue valiendo', () => {
    expect(armarG({ kind: 'deposito', fecha: '2026-11-03', cuentaId: 2, contrapartidaId: 20, montoCents: 100 }).lineas).toHaveLength(2);
  });
});

describe('J · registrarMovimiento usa la misma transacción para el asiento', () => {
  it('no abre otra conexión con generarAsientoManual mientras sostiene el candado', async () => {
    const { readFileSync } = await import('node:fs');
    const fuente = readFileSync('lib/contabilidad/bancos.ts', 'utf8');
    expect(fuente).not.toContain('generarAsientoManual(');
    expect(fuente).toContain('insertarAsientoManualTx(tx,');
  });
});
