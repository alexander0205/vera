/**
 * Depósito sin identificar: APAGADO por defecto (el banco se contaría dos veces
 * si luego se cobra en Cobros). Encendido, registrarlo asienta banco contra
 * «Depósitos por identificar» y marca la línea en UNA transacción. La base se
 * simula por el texto de cada consulta.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';

const dialect = new PgDialect();
const sentencias: string[] = [];
let enTransaccion = false;
const fueraDeTx: string[] = [];
let reclamar: unknown[] = [];
let falla: string | null = null;

function ejecutar(q: never, tx: boolean): unknown[] {
  const { sql, params } = dialect.sqlToQuery(q);
  const texto = sql.trim().replace(/\s+/g, ' ');
  sentencias.push(texto);
  if (!tx && enTransaccion) fueraDeTx.push(texto);
  if (falla && texto.includes(falla)) throw new Error('se cayó la base');
  if (texto.includes('count(*) FILTER')) return [{ emparejadas: 0, pendientes: 0, registradas: 0, asignadas: 0, ignoradas: 0, dep: 0, ret: 0 }];
  if (texto.includes('FROM contabilidad_extracto_lineas') && texto.includes('FOR UPDATE')) return reclamar;
  if (texto.startsWith('SELECT id FROM contabilidad_asiento_lineas WHERE asiento_id')) return [{ id: 555 }];
  if (texto.startsWith('SELECT id, imputable, activa FROM contabilidad_cuentas')) return params.slice(1).map((id) => ({ id, imputable: true, activa: true }));
  if (texto.startsWith('SELECT imputable, activa FROM contabilidad_cuentas')) return [{ imputable: true, activa: true }];
  if (texto.includes("nextval('contabilidad_asiento_manual_seq')")) return [{ origen_id: 5 }];
  if (texto.startsWith('INSERT INTO contabilidad_asientos')) return [{ id: 42 }];
  return [];
}

vi.mock('@/lib/db/drizzle', () => ({
  db: {
    execute: async (q: never) => ejecutar(q, false),
    transaction: async (fn: (tx: { execute: (q: never) => Promise<unknown> }) => Promise<unknown>) => {
      enTransaccion = true;
      try { return await fn({ execute: async (q: never) => ejecutar(q, true) }); } finally { enTransaccion = false; }
    },
  },
}));
vi.mock('@/lib/contabilidad/bancos', () => ({
  cuentasBanco: async () => [{ id: 7, codigo: '110201', nombre: 'Banco A', tipo: 'activo', imputable: true, activa: true }],
  tablaExiste: async () => true,
  textoLibre: (v: unknown, max: number) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null),
}));
vi.mock('@/lib/contabilidad/catalogo-base', () => ({
  CODIGO: { depositosPorIdentificar: '2115', saldosFavorClientes: '2104' },
  asegurarCuentaBase: async () => 2115,
}));
vi.mock('@/lib/contabilidad/config', () => ({ getConfig: async () => ({}) }));

import { registrarDepositoSinIdentificar, asignarDeposito, bandejaExtracto, ConciliacionError, depositosSinIdentificarActivo } from '@/lib/contabilidad/conciliacion';

beforeEach(() => {
  sentencias.length = 0; fueraDeTx.length = 0; falla = null; enTransaccion = false;
  reclamar = [{ cuentaId: 7, fecha: '2026-11-03', monto: '250000', referencia: 'R-1', descripcion: 'Deposito' }];
});
afterEach(() => { delete process.env.CONCILIACION_DEPOSITOS_ACTIVA; });

describe('bandera apagada (por defecto)', () => {
  it('no está encendida sin la variable', () => {
    expect(depositosSinIdentificarActivo()).toBe(false);
  });

  it('registrar y asignar se niegan y no tocan la base', async () => {
    await expect(registrarDepositoSinIdentificar(1, 9, 100)).rejects.toMatchObject({ status: 403 });
    await expect(asignarDeposito(1, 9, 100, { clienteId: 3 })).rejects.toBeInstanceOf(ConciliacionError);
    expect(sentencias).toEqual([]);
  });

  it('la bandeja lo declara para que la pantalla muestre solo información', async () => {
    const b = await bandejaExtracto(1, 7);
    expect(b.depositosActivo).toBe(false);
  });
});

describe('bandera encendida', () => {
  beforeEach(() => { process.env.CONCILIACION_DEPOSITOS_ACTIVA = '1'; });

  it('asienta banco contra Depósitos por identificar, concilia y marca, todo dentro de la misma transacción', async () => {
    const r = await registrarDepositoSinIdentificar(1, 9, 100);
    expect(r).toEqual({ asientoId: 42 });
    const lineas = sentencias.filter((s) => s.startsWith('INSERT INTO contabilidad_asiento_lineas'));
    expect(lineas).toHaveLength(2);
    expect(sentencias.some((s) => s.startsWith('INSERT INTO contabilidad_conciliaciones'))).toBe(true);
    expect(sentencias.some((s) => s.includes("SET estado = 'registrada'"))).toBe(true);
    // Nada del asiento ni de la marca salió por otra conexión.
    expect(fueraDeTx.filter((s) => /INSERT INTO contabilidad_(asientos|asiento_lineas|conciliaciones)|SET estado/.test(s))).toEqual([]);
  });

  it('si la línea ya no está pendiente, no asienta nada', async () => {
    reclamar = [];
    await expect(registrarDepositoSinIdentificar(1, 9, 100)).rejects.toBeInstanceOf(ConciliacionError);
    expect(sentencias.some((s) => s.startsWith('INSERT INTO contabilidad_asientos'))).toBe(false);
  });

  it('si algo falla después de asentar, la transacción entera se cae (no queda asiento sin marca)', async () => {
    falla = 'INSERT INTO contabilidad_conciliaciones';
    await expect(registrarDepositoSinIdentificar(1, 9, 100)).rejects.toThrow('se cayó la base');
    // El error sale de DENTRO de la transacción: con la base real el rollback deshace el asiento.
    expect(sentencias.some((s) => s.startsWith('INSERT INTO contabilidad_asientos'))).toBe(true);
    expect(sentencias.some((s) => s.includes("SET estado = 'registrada'"))).toBe(false);
  });
});
