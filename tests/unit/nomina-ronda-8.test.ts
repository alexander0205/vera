import { describe, it, expect, vi } from 'vitest';
import { decidirCuentaPorCobrarEmpleados, esCuentaDeEmpleados, type CuentaMinima } from '@/lib/nomina/cuenta-por-cobrar-empleados';
import { leerDesembolso } from '@/lib/nomina/prestamos-desembolso';
import fs from 'node:fs';

const cuenta = (id: number, codigo: string, nombre: string, extra: Partial<CuentaMinima> = {}): CuentaMinima =>
  ({ id, codigo, nombre, tipo: 'activo', activa: true, imputable: true, ...extra });

describe('1. cuenta 1108 Cuentas por cobrar a empleados', () => {
  it('empresa sin ella: se crea con el código 1108, sin aviso', () => {
    const d = decidirCuentaPorCobrarEmpleados([cuenta(1, '1101', 'Caja'), cuenta(2, '1107', 'Retenciones por cobrar')]);
    expect(d).toEqual({ accion: 'crear', codigo: '1108', aviso: null });
  });

  it('empresa que ya la tiene (por su nombre): se usa, no se crea otra', () => {
    const d = decidirCuentaPorCobrarEmpleados([cuenta(7, '1108', 'Cuentas por cobrar a empleados'), cuenta(2, '1107', 'Retenciones por cobrar')]);
    expect(d).toEqual({ accion: 'usar', cuentaId: 7, codigo: '1108' });
  });

  it('catálogo propio con otro nombre y otro código: se reconoce por el nombre', () => {
    const d = decidirCuentaPorCobrarEmpleados([cuenta(9, '1120', 'Préstamos: por cobrar a empleados')]);
    expect(d).toMatchObject({ accion: 'usar', cuentaId: 9, codigo: '1120' });
  });

  it('el código 1108 ocupado por OTRO uso: nunca se adopta; se crea con un código libre y se avisa', () => {
    const d = decidirCuentaPorCobrarEmpleados([cuenta(5, '1108', 'Anticipos a proveedores'), cuenta(6, '1109', 'Otra cosa')]);
    expect(d.accion).toBe('crear');
    if (d.accion === 'crear') {
      expect(d.codigo).toBe('1110');
      expect(d.aviso).toMatch(/1108.*Anticipos a proveedores/);
    }
  });

  it('una cuenta inactiva, de otro tipo o no imputable no cuenta como la de empleados', () => {
    expect(esCuentaDeEmpleados(cuenta(1, '1108', 'Cuentas por cobrar a empleados', { activa: false }))).toBe(false);
    expect(esCuentaDeEmpleados(cuenta(1, '1108', 'Cuentas por cobrar a empleados', { tipo: 'pasivo' }))).toBe(false);
    expect(esCuentaDeEmpleados(cuenta(1, '1108', 'Cuentas por cobrar a empleados', { imputable: false }))).toBe(false);
  });

  it('es idempotente: tras crearla, la siguiente decisión es usarla', () => {
    const antes = [cuenta(2, '1107', 'Retenciones por cobrar')];
    const d1 = decidirCuentaPorCobrarEmpleados(antes);
    expect(d1.accion).toBe('crear');
    const despues = [...antes, cuenta(3, d1.accion === 'crear' ? d1.codigo : '', 'Cuentas por cobrar a empleados')];
    expect(decidirCuentaPorCobrarEmpleados(despues)).toMatchObject({ accion: 'usar', cuentaId: 3 });
  });

  it('asegurar no escribe nada si la cuenta ya existe y crea una sola vez si falta', async () => {
    vi.resetModules();
    const llamadas: number[] = [];
    const cuentasQue = (filas: CuentaMinima[], insertado: { id: number }[]) => {
      let i = 0;
      return { execute: async () => { llamadas.push(i); return [filas, [{ n: filas.length || 1 }], insertado][i++] ?? []; } };
    };
    const { asegurarCuentaPorCobrarEmpleados } = await import('@/lib/nomina/cuenta-por-cobrar-empleados');
    const ya = await asegurarCuentaPorCobrarEmpleados(1, 5, cuentasQue([cuenta(7, '1108', 'Cuentas por cobrar a empleados')], []) as never);
    expect(ya).toMatchObject({ cuentaId: 7, creada: false });
    expect(llamadas).toHaveLength(2); // solo lecturas
    llamadas.length = 0;
    const nueva = await asegurarCuentaPorCobrarEmpleados(1, 5, cuentasQue([cuenta(2, '1107', 'Retenciones por cobrar')], [{ id: 99 }]) as never);
    expect(nueva).toMatchObject({ cuentaId: 99, creada: true, codigo: '1108' });
    expect(llamadas).toHaveLength(3); // dos lecturas y un insert
  });

  it('una empresa sin catálogo no recibe cuentas', async () => {
    const { asegurarCuentaPorCobrarEmpleados } = await import('@/lib/nomina/cuenta-por-cobrar-empleados');
    let i = 0;
    const respuestas: unknown[][] = [[], [{ n: 0 }]];
    const ex = { execute: async () => respuestas[i++] ?? [] };
    expect(await asegurarCuentaPorCobrarEmpleados(1, 5, ex as never)).toBeNull();
  });
});

describe('1. la cuota del préstamo se abona a la 1108 asegurada', () => {
  it('con el concepto sin cuenta (empresa existente), la cuota sale con la cuenta asegurada y se enlazan los conceptos', async () => {
    vi.resetModules();
    const vincular = vi.fn(async () => undefined);
    vi.doMock('@/lib/nomina/cuenta-por-cobrar-empleados', () => ({
      asegurarCuentaPorCobrarEmpleados: async () => ({ cuentaId: 777, codigo: '1108', creada: true, aviso: null }),
      buscarCuentaPorCobrarEmpleados: async () => null,
      vincularConceptosDePrestamo: vincular,
    }));
    // select() devuelve, en orden: catálogo, asignaciones, préstamos.
    const colas: unknown[][] = [
      [{ id: 1, codigo: 'prestamo', nombre: 'Préstamo', tipo: 'descuento', cotizaTss: false, gravaIsr: false, cuentaId: null, activo: true }],
      [],
      [{ id: 5, empleadoId: 10, saldoCents: 500_000, cuotaCents: 250_000, desde: '2026-01-01', comentario: null }],
    ];
    let i = 0;
    const cadena = (res: unknown[]) => {
      const c: Record<string, unknown> = {};
      for (const m of ['from', 'where']) c[m] = () => c;
      (c as { then: unknown }).then = (ok: (v: unknown) => unknown) => Promise.resolve(res).then(ok);
      return c;
    };
    vi.doMock('@/lib/db/drizzle', () => ({ db: { select: () => cadena(colas[i++] ?? []) } }));
    const { conceptosParaCorrida } = await import('@/lib/nomina/conceptos-db');
    const mapa = await conceptosParaCorrida(35, [10], '2026-11-01', '2026-11-15');
    const cuota = mapa.get(10)?.find((c) => c.prestamoId === 5);
    expect(cuota?.cuentaId).toBe(777);
    expect(vincular).toHaveBeenCalledWith(35, 777);
  });
});

describe('1. desembolso del préstamo', () => {
  it('lee lo que llegó en el cuerpo', () => {
    expect(leerDesembolso({ cuentaSalidaId: 12 })).toEqual({ tipo: 'cuenta', cuentaSalidaId: 12 });
    expect(leerDesembolso({ yaEntregado: true })).toEqual({ tipo: 'ya-entregado' });
    expect(leerDesembolso({ yaEntregado: true, cuentaSalidaId: 12 })).toEqual({ tipo: 'ya-entregado' });
    expect(leerDesembolso(null)).toEqual({ tipo: 'sin-indicar' });
    expect(leerDesembolso({ cuentaSalidaId: -1 })).toEqual({ tipo: 'sin-indicar' });
  });

  async function montar(opts: { asiento?: () => Promise<unknown>; cuenta?: null }) {
    vi.resetModules();
    const generar = vi.fn(opts.asiento ?? (async () => ({ creado: true, asientoId: 55 })));
    const borrar = vi.fn(async () => undefined);
    vi.doMock('@/lib/contabilidad/asientos', () => ({ generarAsientoPrestamoEmpleado: generar, borrarAsientoDeOrigen: borrar }));
    vi.doMock('@/lib/nomina/cuenta-por-cobrar-empleados', () => ({
      asegurarCuentaPorCobrarEmpleados: async () => (opts.cuenta === null ? null : { cuentaId: 1490, codigo: '1108', creada: false, aviso: null }),
      vincularConceptosDePrestamo: async () => undefined,
    }));
    const m = await import('@/lib/nomina/prestamos-desembolso');
    return { ...m, generar, borrar };
  }
  const base = { teamId: 1, userId: 2, prestamoId: 9, montoCents: 1_000_000, fecha: '2026-11-05', empleado: 'Ana' };

  it('con cuenta elegida asienta Dr 1108 / Cr esa cuenta, una sola vez por préstamo', async () => {
    const { registrarDesembolso, generar } = await montar({});
    const r = await registrarDesembolso({ ...base, desembolso: { tipo: 'cuenta', cuentaSalidaId: 1101 } });
    expect(r.asientoId).toBe(55);
    expect(generar).toHaveBeenCalledTimes(1);
    expect((generar.mock.calls[0] as unknown[])[1]).toMatchObject({ prestamoId: 9, montoCents: 1_000_000, cuentaPorCobrarId: 1490, cuentaSalidaId: 1101 });
  });

  it('«ya lo entregué antes»: no asienta nada y avisa que el contable lo registre a mano', async () => {
    const { registrarDesembolso, generar } = await montar({});
    const r = await registrarDesembolso({ ...base, desembolso: { tipo: 'ya-entregado' } });
    expect(generar).not.toHaveBeenCalled();
    expect(r.asientoId).toBeNull();
    expect(r.avisos.join(' ')).toMatch(/contable debe registrarlo a mano/);
  });

  it('si no hay catálogo, o falta la migración, o el asiento falla: el préstamo sigue y se avisa', async () => {
    const a = await montar({ cuenta: null });
    expect((await a.registrarDesembolso({ ...base, desembolso: { tipo: 'cuenta', cuentaSalidaId: 1101 } })).avisos.join(' ')).toMatch(/catálogo/);
    const b = await montar({ asiento: async () => { throw Object.assign(new Error('x'), { code: '23514' }); } });
    expect((await b.registrarDesembolso({ ...base, desembolso: { tipo: 'cuenta', cuentaSalidaId: 1101 } })).avisos.join(' ')).toMatch(/0235/);
    const c = await montar({ asiento: async () => ({ creado: false, motivo: 'contabilidad-apagada' }) });
    expect((await c.registrarDesembolso({ ...base, desembolso: { tipo: 'cuenta', cuentaSalidaId: 1101 } })).avisos.join(' ')).toMatch(/apagada/);
  });

  it('cancelar un préstamo sin cuotas descontadas revierte su desembolso; con cuotas, no', async () => {
    const { revertirDesembolsoSiSinCuotas, borrar } = await montar({});
    expect(await revertirDesembolsoSiSinCuotas(1, { id: 9, montoCents: 1_000_000, saldoCents: 1_000_000 })).toBe(true);
    expect(borrar).toHaveBeenCalledWith(1, 'prestamo_empleado', 9);
    borrar.mockClear();
    expect(await revertirDesembolsoSiSinCuotas(1, { id: 9, montoCents: 1_000_000, saldoCents: 750_000 })).toBe(false);
    expect(borrar).not.toHaveBeenCalled();
  });
});

describe('1. migración 0235 y pantalla', () => {
  it('la migración agrega el origen a la restricción leyendo la vigente (no pisa lo que otras agreguen)', () => {
    const sql = fs.readFileSync('lib/db/migrations/0235_asiento_origen_prestamo_empleado.sql', 'utf8');
    expect(sql).toMatch(/pg_get_constraintdef/);
    expect(sql).toMatch(/prestamo_empleado/);
    expect(sql).toMatch(/LIKE '%prestamo_empleado%'/); // idempotente
  });
  it('el formulario pregunta de dónde salió el dinero y ofrece «ya lo entregué antes»', () => {
    const src = fs.readFileSync('app/nomina/empleados/[id]/conceptos/_page-client.tsx', 'utf8');
    expect(src).toMatch(/¿De dónde salió el dinero\?/);
    expect(src).toMatch(/Ya lo entregué antes \(sin asiento\)/);
  });
});
