import { describe, it, expect, vi } from 'vitest';
import { esReingreso, fraccionParaPromedio } from '@/lib/nomina/regalia';
import { promedioUltimosMeses } from '@/lib/nomina/liquidacion';

describe('1. promedio de 12 meses: semanal y por horas pesan por días contratados', () => {
  const claves = Array.from({ length: 12 }, (_, i) => `2026-${String(i + 1).padStart(2, '0')}`);

  it('semanal con 52,000 fijos: el promedio es 52,000 aunque los meses traigan 4 o 5 semanas', () => {
    const semanas = [4, 4, 5, 4, 4, 5, 4, 4, 5, 4, 4, 5];
    const dev: Record<string, number> = {};
    const frac: Record<string, number> = {};
    claves.forEach((k, i) => {
      dev[k] = semanas[i] * 1_200_000;
      // Los días pagados (28 o 35) darían 0.9 o 1.1 del mes; contratado es el mes entero.
      frac[k] = fraccionParaPromedio({ semanal: true, conHoras: false, diasPagados: semanas[i] * 7, mes: k, ingreso: '2020-01-01', salida: null })!;
    });
    expect(Object.values(frac).every((f) => f === 1)).toBe(true);
    expect(promedioUltimosMeses(dev, '2026-12-20', frac)?.promedioCents).toBe(5_200_000);
  });

  it('por horas, 30,000 en 22 días con horas: no se infla a 38 %', () => {
    const f = fraccionParaPromedio({ semanal: false, conHoras: true, diasPagados: 22, mes: '2026-11', ingreso: '2020-01-01', salida: null });
    expect(f).toBe(1);
    expect(promedioUltimosMeses({ '2026-11': 3_000_000 }, '2026-11-30', { '2026-11': f! })?.promedioCents).toBe(3_000_000);
  });

  it('el mes de ingreso pesa por los días contratados (21-dic: 11 de 31)', () => {
    const f = fraccionParaPromedio({ semanal: true, conHoras: false, diasPagados: 7, mes: '2025-12', ingreso: '2025-12-21', salida: null })!;
    expect(f).toBeCloseTo(11 / 31, 5);
  });

  it('mensual y quincenal se quedan como estaban: días pagados ÷ días del mes', () => {
    expect(fraccionParaPromedio({ semanal: false, conHoras: false, diasPagados: 15, mes: '2026-11', ingreso: null, salida: null })).toBe(0.5);
    expect(fraccionParaPromedio({ semanal: false, conHoras: false, diasPagados: 31, mes: '2026-12', ingreso: null, salida: null })).toBe(1);
    expect(fraccionParaPromedio({ semanal: false, conHoras: false, diasPagados: null, mes: '2026-12', ingreso: null, salida: null })).toBeNull();
  });
});

describe('2. al revertir una aprobación se borran SIEMPRE los asientos de la corrida', () => {
  async function montar(opts: { borrarFalla?: boolean }) {
    vi.resetModules();
    const borrados: string[] = [];
    const errores = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.doMock('@/lib/auth/api-guard', () => ({ requireModuleAndPermission: async () => ({ ok: true, teamId: 1, user: { id: 1 } }) }));
    vi.doMock('@/lib/nomina/conceptos-db', () => ({
      PrestamoCambioError: class extends Error {},
      reconciliarPrestamosDeCorrida: async () => [],
      descontarPrestamosDeCorrida: async () => 0,
      restaurarPrestamosDeCorrida: async () => undefined,
    }));
    vi.doMock('@/lib/nomina/obligaciones-db', () => ({ crearObligacionesCorrida: async () => { throw new Error('boom'); } }));
    vi.doMock('@/lib/nomina/regalia-db', () => ({ lineasDeLiquidadosEnRegalia: async () => [] }));
    vi.doMock('@/lib/contabilidad/asientos', () => ({
      // Los asientos NO los creó esta petición (creado: false): los pudo crear «Generar pendientes» entretanto.
      generarAsientoNomina: async () => ({ creado: false, motivo: 'ya-tiene-asiento' }),
      generarAsientoProvisionNomina: async () => ({ creado: false, motivo: 'ya-tiene-asiento' }),
      borrarAsientoDeOrigen: async (_t: number, origen: string) => { borrados.push(origen); if (opts.borrarFalla) throw new Error('no se pudo'); },
    }));
    const cadena = (res: () => unknown[]) => {
      const c: Record<string, unknown> = {};
      for (const m of ['from', 'where', 'set', 'limit']) c[m] = () => c;
      c.returning = async () => res();
      (c as { then: unknown }).then = (ok: (v: unknown) => unknown) => Promise.resolve(res()).then(ok);
      return c;
    };
    vi.doMock('@/lib/db/drizzle', () => ({
      db: { select: () => cadena(() => [{ id: 7, estado: 'borrador', tipo: 'mensual', fechaInicio: '2026-11-01' }]), update: () => cadena(() => [{ id: 7 }]) },
    }));
    const { POST } = await import('@/app/api/nomina/corridas/[id]/aprobar/route');
    let error: unknown = null;
    try { await POST(new Request('http://x'), { params: Promise.resolve({ id: '7' }) }); } catch (e) { error = e; }
    return { borrados, error, errores };
  }

  it('borra los dos asientos aunque este intento no los haya creado', async () => {
    const { borrados, error } = await montar({});
    expect(String(error)).toMatch(/boom/);
    expect(borrados.sort()).toEqual(['nomina', 'provision_nomina']);
  });

  it('si la propia reversión falla, lo registra en el log con el id de la corrida y sigue con lo demás', async () => {
    const { borrados, error, errores } = await montar({ borrarFalla: true });
    expect(String(error)).toMatch(/boom/);
    expect(borrados).toHaveLength(2); // intentó los dos
    const mensajes = errores.mock.calls.map((c) => String(c[0]));
    expect(mensajes.some((m) => m.includes('corrida 7'))).toBe(true);
  });
});

describe('3. borrar una liquidación con la regalía ya aprobada avisa que hay que pagarla aparte', () => {
  function dbCon(resultados: unknown[][]) {
    let i = 0;
    const cadena = (res: unknown[]) => {
      const c: Record<string, unknown> = {};
      for (const m of ['from', 'where', 'limit']) c[m] = () => c;
      (c as { then: unknown }).then = (ok: (v: unknown) => unknown) => Promise.resolve(res).then(ok);
      return c;
    };
    return { select: () => cadena(resultados[i++] ?? []) };
  }
  async function reponer(resultados: unknown[][]) {
    vi.resetModules();
    const recalcular = vi.fn(async () => ({ ok: true }));
    vi.doMock('@/lib/db/drizzle', () => ({ db: dbCon(resultados) }));
    vi.doMock('@/lib/nomina/regalia-db', () => ({ recalcularCorridaRegalia: recalcular, devengadoYCobertura: async () => ({}), TIPOS_REGULARES_SQL: [] }));
    const { reponerEnRegaliaTrasRevertir } = await import('@/lib/nomina/liquidacion-db');
    return { r: await reponerEnRegaliaTrasRevertir(1, 2026, '2026-12-01', 7), recalcular };
  }

  it('aprobada y sin la línea del empleado: pagar aparte', async () => {
    const { r } = await reponer([[{ id: 5, estado: 'aprobada' }], []]);
    expect(r).toEqual({ hayQueRegenerar: false, pagarAparte: true });
  });
  it('aprobada y con su línea: nada que avisar', async () => {
    const { r } = await reponer([[{ id: 5, estado: 'aprobada' }], [{ id: 1 }]]);
    expect(r).toEqual({ hayQueRegenerar: false, pagarAparte: false });
  });
  it('en borrador: se recalcula; sin corrida: hay que generarla', async () => {
    const a = await reponer([[{ id: 5, estado: 'borrador' }]]);
    expect(a.recalcular).toHaveBeenCalledTimes(1);
    expect(a.r.pagarAparte).toBe(false);
    const b = await reponer([[]]);
    expect(b.r.hayQueRegenerar).toBe(true);
  });
});

describe('4. no se aprueba una regalía con líneas de empleados ya liquidados', () => {
  it('esReingreso distingue a quien volvió a trabajar', () => {
    expect(esReingreso({ estado: 'activo', fechaIngreso: '2026-09-01' }, '2026-06-30')).toBe(true);
    expect(esReingreso({ estado: 'activo', fechaIngreso: '2020-01-01' }, '2026-06-30')).toBe(false);
    expect(esReingreso({ estado: 'inactivo', fechaIngreso: '2026-09-01' }, '2026-06-30')).toBe(false);
  });

  it('la aprobación responde 409 con el mensaje y no llega a reclamar la corrida', async () => {
    vi.resetModules();
    const actualizar = vi.fn();
    vi.doMock('@/lib/auth/api-guard', () => ({ requireModuleAndPermission: async () => ({ ok: true, teamId: 1, user: { id: 1 } }) }));
    vi.doMock('@/lib/nomina/conceptos-db', () => ({ PrestamoCambioError: class extends Error {} }));
    vi.doMock('@/lib/nomina/obligaciones-db', () => ({}));
    vi.doMock('@/lib/contabilidad/asientos', () => ({}));
    vi.doMock('@/lib/nomina/regalia-db', () => ({ lineasDeLiquidadosEnRegalia: async () => ['Ana Prueba'] }));
    const cadena = (res: () => unknown[]) => {
      const c: Record<string, unknown> = {};
      for (const m of ['from', 'where', 'set', 'limit']) c[m] = () => c;
      c.returning = async () => res();
      (c as { then: unknown }).then = (ok: (v: unknown) => unknown) => Promise.resolve(res()).then(ok);
      return c;
    };
    vi.doMock('@/lib/db/drizzle', () => ({
      db: { select: () => cadena(() => [{ id: 9, estado: 'borrador', tipo: 'regalia', fechaInicio: '2026-01-01' }]), update: () => { actualizar(); return cadena(() => [{ id: 9 }]); } },
    }));
    const { POST } = await import('@/app/api/nomina/corridas/[id]/aprobar/route');
    const res = await POST(new Request('http://x'), { params: Promise.resolve({ id: '9' }) });
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/Ana Prueba/);
    expect(actualizar).not.toHaveBeenCalled();
  });
});
