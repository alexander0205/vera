import { describe, it, expect, vi } from 'vitest';
import { calcularRegalia, type CoberturaMes } from '@/lib/nomina/regalia';
import { promedioUltimosMeses } from '@/lib/nomina/liquidacion';
import { diasCesantiaLey } from '@/lib/nomina/provisiones';

describe('1. cobertura semanal: no paga de más', () => {
  const base = { salarioMensualCents: 5_200_000, fechaIngreso: null, fechaSalida: null, topeExentoCents: null };
  const semanas = (n: number) => ({ q1: false, q2: false, diasSemanales: n * 7 }) as CoberturaMes;

  it('todo 2025 pagado en 52 semanas (4 o 5 por mes): la regalía es 52,000 y no avisa de meses estimados', () => {
    const porMes = [4, 4, 5, 4, 4, 5, 4, 4, 5, 4, 4, 5]; // 52 semanas
    const devengadoPorMes: Record<string, number> = {};
    const coberturaPorMes: Record<string, CoberturaMes> = {};
    porMes.forEach((n, i) => {
      const k = `2025-${String(i + 1).padStart(2, '0')}`;
      devengadoPorMes[k] = n * 1_200_000;
      coberturaPorMes[k] = semanas(n);
    });
    const r = calcularRegalia({ ...base, anio: 2025, devengadoPorMes, coberturaPorMes });
    expect(r.regaliaCents).toBe(5_200_000);
    expect(r.mesesEstimados).toEqual([]);
  });

  it('generada el 10-dic con 1 semana de diciembre aprobada: diciembre cuenta 52,000', () => {
    const r = calcularRegalia({
      ...base, anio: 2026, devengadoPorMes: { '2026-12': 1_200_000 }, coberturaPorMes: { '2026-12': semanas(1) },
    });
    expect(r.devengadoRealCents + r.devengadoEstimadoCents - 11 * 5_200_000).toBe(5_200_000);
  });

  it('con 43 semanas de enero a noviembre y 1 de diciembre, el año suma 52,000', () => {
    const porMes = [4, 4, 5, 4, 4, 5, 4, 4, 5, 4, 4, 1];
    const devengadoPorMes: Record<string, number> = {};
    const coberturaPorMes: Record<string, CoberturaMes> = {};
    porMes.forEach((n, i) => {
      const k = `2026-${String(i + 1).padStart(2, '0')}`;
      devengadoPorMes[k] = n * 1_200_000;
      coberturaPorMes[k] = semanas(n);
    });
    const r = calcularRegalia({ ...base, anio: 2026, devengadoPorMes, coberturaPorMes });
    expect(Math.abs(r.regaliaCents - 5_200_000)).toBeLessThanOrEqual(1);
  });
});

describe('2. el salario promedio de 12 meses no cuenta como completos los meses pagados a medias', () => {
  const completos = (desde: number, hasta: number, anio: number, monto = 3_000_000) =>
    Object.fromEntries(Array.from({ length: hasta - desde + 1 }, (_, i) => [`${anio}-${String(desde + i).padStart(2, '0')}`, monto]));

  it('salario fijo de 30,000 y solo la 1.ª quincena de noviembre: el promedio es 30,000', () => {
    const dev = { ...completos(11, 12, 2025), ...completos(1, 10, 2026), '2026-11': 1_500_000 };
    const frac = { '2026-11': 0.5 };
    expect(promedioUltimosMeses(dev, '2026-11-15', frac)?.promedioCents).toBe(3_000_000);
    // Sin la fracción, el mes a medias bajaba el promedio (el error que se corrige).
    expect(promedioUltimosMeses(dev, '2026-11-15')?.promedioCents).toBeLessThan(3_000_000);
  });

  it('entró el 21-dic del año anterior: ese mes pagó 11 de 31 días y el promedio sigue en 30,000', () => {
    const dev = { '2025-12': Math.round((3_000_000 * 11) / 31), ...completos(1, 10, 2026), '2026-11': 1_500_000 };
    const frac = { '2025-12': 11 / 31, '2026-11': 0.5 };
    expect(Math.abs((promedioUltimosMeses(dev, '2026-11-15', frac)?.promedioCents ?? 0) - 3_000_000)).toBeLessThanOrEqual(1);
  });
});

describe('3. la liquidación saca al empleado de la regalía en borrador', () => {
  /** Un `tx` falso: cada select devuelve lo siguiente de la lista; anota deletes y updates. */
  function txFalso(resultados: unknown[][]) {
    const llamadas = { deletes: 0, updates: [] as unknown[] };
    let i = 0;
    const cadena = (res: unknown[]) => {
      const c: Record<string, unknown> = {};
      for (const m of ['from', 'where', 'limit', 'for', 'set']) c[m] = () => c;
      (c as { then: unknown }).then = (ok: (v: unknown) => unknown) => Promise.resolve(res).then(ok);
      return c;
    };
    return {
      llamadas,
      tx: {
        select: () => cadena(resultados[i++] ?? []),
        delete: () => { llamadas.deletes++; return cadena([]); },
        update: () => ({ set: (v: unknown) => { llamadas.updates.push(v); return cadena([]); } }),
      },
    };
  }
  const linea = { id: 9, bruto: 1_000_000, ded: 50_000, neto: 950_000 };

  it('borra solo su línea y ajusta los totales', async () => {
    vi.resetModules();
    const { sacarDeRegaliaEnBorrador } = await import('@/lib/nomina/liquidacion-db');
    const { tx, llamadas } = txFalso([[{ id: 5, estado: 'borrador' }], [linea], [{ id: 10 }]]);
    await sacarDeRegaliaEnBorrador(tx as never, 1, 7, 2026, true);
    expect(llamadas.deletes).toBe(1);
    expect(llamadas.updates).toHaveLength(1);
  });

  it('si era la única línea, borra también la corrida', async () => {
    vi.resetModules();
    const { sacarDeRegaliaEnBorrador } = await import('@/lib/nomina/liquidacion-db');
    const { tx, llamadas } = txFalso([[{ id: 5, estado: 'borrador' }], [linea], []]);
    await sacarDeRegaliaEnBorrador(tx as never, 1, 7, 2026, true);
    expect(llamadas.deletes).toBe(2);
    expect(llamadas.updates).toHaveLength(0);
  });

  it('si la regalía se aprobó mientras tanto y la liquidación la pagaba completa, falla pidiendo recalcular', async () => {
    vi.resetModules();
    const { sacarDeRegaliaEnBorrador } = await import('@/lib/nomina/liquidacion-db');
    const { tx, llamadas } = txFalso([[{ id: 5, estado: 'aprobada' }], [linea]]);
    await expect(sacarDeRegaliaEnBorrador(tx as never, 1, 7, 2026, true)).rejects.toThrow(/aprobó/);
    expect(llamadas.deletes).toBe(0);
  });

  it('si estaba aprobada desde antes (liquidación ya neta), no toca nada', async () => {
    vi.resetModules();
    const { sacarDeRegaliaEnBorrador } = await import('@/lib/nomina/liquidacion-db');
    const { tx, llamadas } = txFalso([[{ id: 5, estado: 'aprobada' }], [linea]]);
    await sacarDeRegaliaEnBorrador(tx as never, 1, 7, 2026, false);
    expect(llamadas.deletes).toBe(0);
  });
});

describe('4. aprobar: el préstamo va antes del asiento y el libro queda igual que la corrida', () => {
  async function montar(opts: { descontarFalla?: 'prestamo'; obligacionesFalla?: boolean }) {
    vi.resetModules();
    const orden: string[] = [];
    const borrados: string[] = [];
    class PrestamoCambioError extends Error {}
    vi.doMock('@/lib/auth/api-guard', () => ({ requireModuleAndPermission: async () => ({ ok: true, teamId: 1, user: { id: 1 } }) }));
    vi.doMock('@/lib/nomina/conceptos-db', () => ({
      PrestamoCambioError,
      reconciliarPrestamosDeCorrida: async () => [],
      descontarPrestamosDeCorrida: async () => { orden.push('descontar'); if (opts.descontarFalla) throw new PrestamoCambioError('cambió'); return 0; },
      restaurarPrestamosDeCorrida: async () => { orden.push('restaurar'); },
    }));
    vi.doMock('@/lib/nomina/obligaciones-db', () => ({
      crearObligacionesCorrida: async () => { orden.push('obligaciones'); if (opts.obligacionesFalla) throw new Error('boom'); },
    }));
    vi.doMock('@/lib/contabilidad/asientos', () => ({
      generarAsientoNomina: async () => { orden.push('asiento'); return { creado: true, asientoId: 11 }; },
      generarAsientoProvisionNomina: async () => { orden.push('provision'); return { creado: true, asientoId: 12 }; },
      borrarAsientoDeOrigen: async (_t: number, origen: string) => { borrados.push(origen); },
    }));
    const cadena = (res: () => unknown[]) => {
      const c: Record<string, unknown> = {};
      for (const m of ['from', 'where', 'set', 'limit']) c[m] = () => c;
      c.returning = async () => res();
      (c as { then: unknown }).then = (ok: (v: unknown) => unknown) => Promise.resolve(res()).then(ok);
      return c;
    };
    let updates = 0;
    vi.doMock('@/lib/db/drizzle', () => ({
      db: { select: () => cadena(() => [{ id: 7, estado: 'borrador' }]), update: () => cadena(() => (++updates === 1 ? [{ id: 7 }] : [{ id: 7 }])) },
    }));
    const { POST } = await import('@/app/api/nomina/corridas/[id]/aprobar/route');
    let res: Response | null = null;
    let error: unknown = null;
    try { res = await POST(new Request('http://x'), { params: Promise.resolve({ id: '7' }) }); } catch (e) { error = e; }
    return { res, error, orden, borrados };
  }

  it('descuenta el préstamo ANTES de crear el asiento', async () => {
    const { res, orden } = await montar({});
    expect(res?.status).toBe(200);
    expect(orden.indexOf('descontar')).toBeLessThan(orden.indexOf('asiento'));
  });

  it('si el préstamo cambió (409), no se llega a crear ningún asiento ni queda nada que borrar', async () => {
    const { res, orden, borrados } = await montar({ descontarFalla: 'prestamo' });
    expect(res?.status).toBe(409);
    expect(orden).not.toContain('asiento');
    expect(orden).not.toContain('provision');
    expect(borrados.sort()).toEqual(['nomina', 'provision_nomina']); // el borrado es incondicional (inofensivo si no hay nada)
    expect(orden).not.toContain('restaurar'); // no llegó a descontar nada
  });

  it('si algo falla después de crear los asientos, se borran, el préstamo se restaura y el error sale', async () => {
    const { res, error, orden, borrados } = await montar({ obligacionesFalla: true });
    expect(res).toBeNull();
    expect(String(error)).toMatch(/boom/);
    expect(borrados.sort()).toEqual(['nomina', 'provision_nomina']);
    expect(orden).toContain('restaurar');
  });
});

describe('5. cesantía: bordes iguales que el primer año', () => {
  it('15, 18 y 60 meses', () => {
    expect(diasCesantiaLey(15)).toBe(27);
    expect(diasCesantiaLey(18)).toBe(34);
    expect(diasCesantiaLey(60)).toBe(115);
  });
  it('los bordes de 3 y 6 meses entran', () => {
    expect(diasCesantiaLey(3)).toBe(6);
    expect(diasCesantiaLey(6)).toBe(13);
    expect(diasCesantiaLey(12)).toBe(21);
    expect(diasCesantiaLey(14)).toBe(21);
    expect(diasCesantiaLey(72)).toBe(138);
  });
});
