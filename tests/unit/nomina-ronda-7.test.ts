import { describe, it, expect } from 'vitest';
import { cerrarIsrDelMes, construirCorrida, esCorridaEspecial, esUltimoPeriodoDelMes, periodoDeCorrida, type EmpleadoParaCorrida, type PrevioMes } from '@/lib/nomina/corrida';
import { isrMensualCents } from '@/lib/nomina/calculo';
import { avisosRegaliaAprobada } from '@/lib/nomina/liquidacion';
import { TASAS_NOMINA_2026 } from '@/lib/config/nomina-tasas';
import type { ConceptoAplicable } from '@/lib/nomina/conceptos';
import fs from 'node:fs';

const incentivo: ConceptoAplicable = { conceptoId: 1, tipo: 'ingreso', nombre: 'Incentivo', montoCents: 500_000, cotizaTss: true, gravaIsr: true };
const emp = (extra: Partial<EmpleadoParaCorrida> = {}): EmpleadoParaCorrida => ({
  id: 1, nombres: 'Ana', apellidos: 'Prueba', cedula: null, cargo: null, salarioBaseCents: 4_000_000, estado: 'activo', conceptos: [incentivo], ...extra,
});
const Q1 = periodoDeCorrida('quincenal-1', { periodo: '2026-11' })!;
const Q2 = periodoDeCorrida('quincenal-2', { periodo: '2026-11' })!;

const previoDe = (l: { brutoCents: number; afpEmpleadoCents: number; sfsEmpleadoCents: number; isrCents: number }): PrevioMes =>
  ({ brutoCents: l.brutoCents, afpCents: l.afpEmpleadoCents, sfsCents: l.sfsEmpleadoCents, isrCents: l.isrCents, exentoCents: 0 });

describe('3. el ISR de la última corrida del mes se cierra contra lo real del mes', () => {
  it('quién cierra el mes: la 2.ª quincena y la última semana que termina dentro de él', () => {
    expect(esUltimoPeriodoDelMes(Q2)).toBe(true);
    expect(esUltimoPeriodoDelMes(Q1)).toBe(false);
    expect(esUltimoPeriodoDelMes({ tipo: 'mensual', fin: '2026-11-30' })).toBe(false);
    expect(esUltimoPeriodoDelMes({ tipo: 'semanal', fin: '2026-11-29' })).toBe(true); // la siguiente semana ya es de diciembre
    expect(esUltimoPeriodoDelMes({ tipo: 'semanal', fin: '2026-11-22' })).toBe(false);
  });

  it('con 2 faltas en la Q2: Q1 + Q2 = ISR mensual de lo real, sin retener de más', () => {
    const l1 = construirCorrida([emp()], TASAS_NOMINA_2026, Q1).lineas[0];
    const ausencias = [{ inicio: '2026-11-20', fin: '2026-11-21' }];
    const sinCierre = construirCorrida([emp({ ausencias, conceptosPrevios: [incentivo] })], TASAS_NOMINA_2026, Q2).lineas[0];
    const conCierre = construirCorrida([emp({ ausencias, conceptosPrevios: [incentivo], previoMes: previoDe(l1) })], TASAS_NOMINA_2026, Q2).lineas[0];
    const baseReal = l1.brutoCents - l1.afpEmpleadoCents - l1.sfsEmpleadoCents + conCierre.brutoCents - conCierre.afpEmpleadoCents - conCierre.sfsEmpleadoCents;
    const delMes = isrMensualCents(baseReal, TASAS_NOMINA_2026.isrEscala);
    console.log('Q1', l1.isrCents, 'Q2 antes', sinCierre.isrCents, 'Q2 ahora', conCierre.isrCents, 'mes', delMes);
    expect(l1.isrCents + conCierre.isrCents).toBe(delMes);
    expect(l1.isrCents + sinCierre.isrCents).toBeGreaterThan(delMes); // el defecto que se corrige
    expect(conCierre.netoCents).toBe(conCierre.brutoCents - conCierre.totalDeduccionesCents);
  });

  it('sin faltas sigue cuadrando: Q1 + Q2 = el mes de 90,000 + 10,000 de incentivos', () => {
    const l1 = construirCorrida([emp()], TASAS_NOMINA_2026, Q1).lineas[0];
    const l2 = construirCorrida([emp({ conceptosPrevios: [incentivo], previoMes: previoDe(l1) })], TASAS_NOMINA_2026, Q2).lineas[0];
    const mes = construirCorrida([emp({ conceptos: [{ ...incentivo, montoCents: 1_000_000 }] })], TASAS_NOMINA_2026, periodoDeCorrida('mensual', { periodo: '2026-11' })!).lineas[0];
    expect(Math.abs(l1.isrCents + l2.isrCents - mes.isrCents)).toBeLessThanOrEqual(2);
  });

  it('sin corrida anterior aprobada en el mes, el cálculo es el de siempre', () => {
    const a = construirCorrida([emp({ conceptosPrevios: [incentivo] })], TASAS_NOMINA_2026, Q2).lineas[0];
    const b = construirCorrida([emp({ conceptosPrevios: [incentivo], previoMes: undefined })], TASAS_NOMINA_2026, Q2).lineas[0];
    expect(a).toEqual(b);
  });

  it('nunca baja de 0', () => {
    const d = { brutoCents: 100_000, afpEmpleadoCents: 2_870, sfsEmpleadoCents: 3_040, isrCents: 0, totalDeduccionesCents: 5_910, netoCents: 94_090 } as never;
    const previo: PrevioMes = { brutoCents: 100_000, afpCents: 2_870, sfsCents: 3_040, isrCents: 50_000, exentoCents: 0 };
    expect(cerrarIsrDelMes(d, previo, 0, TASAS_NOMINA_2026.isrEscala).isrCents).toBe(0);
  });

  it('un ingreso que no grava ISR no entra a la base del mes', () => {
    const d = { brutoCents: 5_000_000, afpEmpleadoCents: 100_000, sfsEmpleadoCents: 100_000, isrCents: 0, totalDeduccionesCents: 200_000, netoCents: 4_800_000 } as never;
    const previo: PrevioMes = { brutoCents: 5_000_000, afpCents: 100_000, sfsCents: 100_000, isrCents: 0, exentoCents: 0 };
    const con = cerrarIsrDelMes(d, previo, 0, TASAS_NOMINA_2026.isrEscala).isrCents;
    const sin = cerrarIsrDelMes(d, previo, 3_000_000, TASAS_NOMINA_2026.isrEscala).isrCents;
    expect(sin).toBeLessThan(con);
  });
});

describe('4. regalía y liquidación no muestran la TSS', () => {
  it('tipos especiales', () => {
    expect(esCorridaEspecial('regalia')).toBe(true);
    expect(esCorridaEspecial('liquidacion')).toBe(true);
    expect(esCorridaEspecial('quincenal-1')).toBe(false);
  });
  it('la pantalla esconde el bloque «A pagar a la TSS» y la autodeterminación en esas corridas', () => {
    const src = fs.readFileSync('app/nomina/corridas/[id]/_page-client.tsx', 'utf8');
    expect(src).toMatch(/!esEspecial && puedePagar && previewTSS/);
    expect(src).toMatch(/\{!esEspecial && \(\s*<Button variant="outline" onClick=\{descargarTSS\}/);
  });
});

describe('5. liquidación contra una regalía aprobada', () => {
  it('dice «ya está en la regalía aprobada (pagada o por pagar)», no «ya se pagó»', () => {
    const [a] = avisosRegaliaAprobada(2_200_000, 1_000_000, 2026);
    expect(a).toMatch(/Ya está en la regalía aprobada de 2026 \(pagada o por pagar\)/);
    expect(a).not.toMatch(/ya se pagó/i);
  });
  it('si sale antes del 31-dic avisa el monto exacto que se le paga de más', () => {
    const avisos = avisosRegaliaAprobada(2_016_667, 2_200_000, 2026);
    expect(avisos).toHaveLength(2);
    expect(avisos[1]).toMatch(/1,833\.33/);
    expect(avisos[1]).toMatch(/ajústalo con tu contable/);
  });
  it('si no sobra nada, no hay segundo aviso', () => {
    expect(avisosRegaliaAprobada(2_200_000, 1_000_000, 2026)).toHaveLength(1);
  });
});

describe('2. Configuración: el nombre del concepto no se aprieta contra el select', () => {
  it('el nombre tiene ancho fijo y el select se reparte el resto', () => {
    const src = fs.readFileSync('app/nomina/configuracion/_conceptos.tsx', 'utf8');
    expect(src).toMatch(/sm:w-56 sm:shrink-0/);
    expect(src).toMatch(/sm:min-w-0 sm:flex-1/);
    expect(src).not.toMatch(/min-w-0 flex-1 \[overflow-wrap/);
  });
});
