import { describe, it, expect, vi } from 'vitest';
import { AVANZADO_DEFAULT, type AvanzadoNomina } from '@/lib/nomina/avanzado';
import { construirCorrida, periodoDeCorrida, type EmpleadoParaCorrida } from '@/lib/nomina/corrida';
import { TASAS_NOMINA_2026 } from '@/lib/config/nomina-tasas';
import { lineasDevengoNomina, lineasProvisionNomina, RESERVAS, type CuentasNomina, type SumasCorrida } from '@/lib/contabilidad/nomina-asientos';

const SALARIO = 3_000_000;
const emp = (dia: string): EmpleadoParaCorrida => ({
  id: 1, nombres: 'Ana', apellidos: 'Prueba', cedula: null, cargo: null, salarioBaseCents: SALARIO, estado: 'activo',
  ausencias: [{ inicio: dia, fin: dia }],
});
const laborable: AvanzadoNomina = { ...AVANZADO_DEFAULT, metodoFaltas: 'laborable' };

describe('N1. una falta «laborable» cuesta lo mismo en cualquier quincena', () => {
  it('salario ÷ divisor (125,892 centavos) en 1.ª y 2.ª quincena de febrero, agosto y el mes completo', () => {
    const esperado = Math.round(SALARIO / 23.83);
    const casos: [string, string, string][] = [
      ['quincenal-1', '2026-02', '2026-02-03'], ['quincenal-2', '2026-02', '2026-02-20'],
      ['quincenal-1', '2026-08', '2026-08-03'], ['quincenal-2', '2026-08', '2026-08-20'],
      ['mensual', '2026-02', '2026-02-10'], ['mensual', '2026-08', '2026-08-10'],
    ];
    for (const [tipo, mes, dia] of casos) {
      const periodo = periodoDeCorrida(tipo as 'mensual', { periodo: mes })!;
      const sinFalta = construirCorrida([{ ...emp(dia), ausencias: [] }], TASAS_NOMINA_2026, periodo, { avanzado: laborable }).lineas[0];
      const conFalta = construirCorrida([emp(dia)], TASAS_NOMINA_2026, periodo, { avanzado: laborable }).lineas[0];
      expect(Math.abs(sinFalta.brutoCents - conFalta.brutoCents - esperado)).toBeLessThanOrEqual(2);
    }
  });

  it('por calendario sigue descontando salario ÷ días del mes', () => {
    const periodo = periodoDeCorrida('mensual', { periodo: '2026-02' })!;
    const l = construirCorrida([emp('2026-02-10')], TASAS_NOMINA_2026, periodo, { avanzado: AVANZADO_DEFAULT }).lineas[0];
    expect(l.brutoCents).toBe(Math.round(SALARIO - SALARIO / 28));
  });
});

describe('N2. cada reserva se consume por sus propias líneas', () => {
  it('la descripción con que se provisiona coincide con la que usa el saldo', () => {
    const ls = lineasProvisionNomina(
      { regaliaCents: 1, vacacionesCents: 1, cesantiaCents: 1 },
      { regaliaGasto: 1, regaliaPasivo: 9, vacacionesGasto: 2, vacacionesPasivo: 9, cesantiaGasto: 3, cesantiaPasivo: 9 },
    );
    const haberes = ls.filter((l) => l.haberCents > 0).map((l) => l.descripcion);
    for (const k of Object.keys(RESERVAS) as (keyof typeof RESERVAS)[]) expect(haberes).toContain(RESERVAS[k].provision);
  });

  it('el consumo de cesantía o vacaciones deja una línea que el saldo de esa reserva reconoce', () => {
    const C: CuentasNomina = {
      gastoSueldos: 6104, gastoAportes: 6105, retencionTss: 2106, isr: 2108, otrasDeducciones: 2101,
      aportesTss: 2107, infotep: 2109, sueldosPorPagar: 2105,
    };
    for (const clave of ['cesantia', 'vacaciones'] as const) {
      const s: SumasCorrida = {
        brutoCents: 1_000_000, netoCents: 1_000_000, retencionTssCents: 0, isrCents: 0, otrasDeduccionesCents: 0,
        aportesTssCents: 0, infotepCents: 0,
        conceptos: [{ cuentaId: 6108, tipo: 'ingreso', montoCents: 1_000_000, nombre: 'Concepto', reservaCuentaId: 2101, reservaClave: clave, reservaUsadaCents: 300_000 }],
      };
      const consumo = lineasDevengoNomina(s, C).find((l) => l.cuentaId === 2101 && l.debeCents === 300_000)!;
      const patron = new RegExp('^' + RESERVAS[clave].consumos[0].replace('%', '.*') + '$');
      expect(consumo.descripcion).toMatch(patron);
      // Y no coincide con los patrones de consumo de otra reserva.
      for (const otra of (Object.keys(RESERVAS) as (keyof typeof RESERVAS)[]).filter((o) => o !== clave)) {
        for (const p of RESERVAS[otra].consumos) expect(consumo.descripcion).not.toMatch(new RegExp('^' + p.replace('%', '.*') + '$'));
      }
    }
  });
});

describe('N4. cambiar «Avanzado» deja auditoría con el valor anterior y el nuevo', () => {
  it('registra solo lo que cambió', async () => {
    vi.resetModules();
    const logAudit = vi.fn();
    const guardar = vi.fn(async () => undefined);
    vi.doMock('@/lib/auth/api-guard', () => ({ requireModuleAndPermission: async () => ({ ok: true, teamId: 3, user: { id: 9, email: 'x@example.com' } }) }));
    vi.doMock('@/lib/audit', () => ({ logAudit, getIp: () => '127.0.0.1' }));
    vi.doMock('@/lib/nomina/avanzado-db', () => ({ leerAvanzado: async () => ({ ...AVANZADO_DEFAULT }), guardarAvanzado: guardar }));
    const { PUT } = await import('@/app/api/nomina/avanzado/route');
    const res = await PUT(new Request('http://x', { method: 'PUT', body: JSON.stringify({ divisorSalarioDiario: 22, metodoFaltas: 'laborable' }) }));
    expect(res.status).toBe(200);
    expect(guardar).toHaveBeenCalledTimes(1);
    expect(logAudit).toHaveBeenCalledTimes(1);
    const arg = logAudit.mock.calls[0][0];
    expect(arg.action).toBe('NOMINA_AVANZADO_CAMBIADO');
    expect(arg.meta.cambios).toEqual({
      divisorSalarioDiario: { antes: 23.83, despues: 22 },
      metodoFaltas: { antes: 'calendario', despues: 'laborable' },
    });
  });

  it('sin cambios no registra; con un valor inválido no guarda', async () => {
    vi.resetModules();
    const logAudit = vi.fn();
    const guardar = vi.fn(async () => undefined);
    vi.doMock('@/lib/auth/api-guard', () => ({ requireModuleAndPermission: async () => ({ ok: true, teamId: 3, user: { id: 9, email: 'x@example.com' } }) }));
    vi.doMock('@/lib/audit', () => ({ logAudit, getIp: () => '127.0.0.1' }));
    vi.doMock('@/lib/nomina/avanzado-db', () => ({ leerAvanzado: async () => ({ ...AVANZADO_DEFAULT }), guardarAvanzado: guardar }));
    const { PUT } = await import('@/app/api/nomina/avanzado/route');
    await PUT(new Request('http://x', { method: 'PUT', body: JSON.stringify({}) }));
    expect(logAudit).not.toHaveBeenCalled();
    const malo = await PUT(new Request('http://x', { method: 'PUT', body: JSON.stringify({ divisorSalarioDiario: 5 }) }));
    expect(malo.status).toBe(400);
    expect(guardar).toHaveBeenCalledTimes(1); // solo el PUT vacío (valores de ley)
  });
});
