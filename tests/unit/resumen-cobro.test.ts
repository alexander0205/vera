import { describe, it, expect } from 'vitest';
import { resumirCobro, partidasDeFamilia } from '@/lib/administracion-escolar/resumen-cobro';

/**
 * Vencido / próximo pago / falta del año / pagado. El caso es el de una familia
 * real de Mi Casita el 22-10-2026: una cuota de RD$200 vencida el 18-10, una
 * factura de contado de RD$23,000 del 25-09 sin pagar y nueve mensualidades de
 * RD$18,000 de octubre a junio todavía sin facturar.
 */
const HOY = '2026-10-22';
const meses = ['2026-10-30', '2026-11-30', '2026-12-30', '2027-01-30', '2027-02-28', '2027-03-30', '2027-04-30', '2027-05-30', '2027-06-30'];

describe('resumirCobro', () => {
  const familia = partidasDeFamilia({
    cargos: [
      { saldoCentavos: 20000, montoCentavos: 20000, fechaVencimiento: '2026-10-18', ecfDocumentId: 4180, estado: 'vencido' },
      { saldoCentavos: 0, montoCentavos: 1800000, fechaVencimiento: '2026-09-30', ecfDocumentId: 3000, estado: 'pagado' },
      { saldoCentavos: 100, montoCentavos: 100, fechaVencimiento: '2026-11-15', ecfDocumentId: null, estado: 'anulado' },
      ...meses.map((m) => ({ saldoCentavos: 1800000, montoCentavos: 1800000, fechaVencimiento: m, ecfDocumentId: null, estado: 'pendiente' })),
    ],
    facturas: [{ saldoCentavos: 2300000, montoTotal: 2300000, vence: '2026-09-25', esMora: false }],
  });
  const r = resumirCobro(familia, HOY);

  it('vencido: lo que pasó su fecha, con lo de fuera del colegio aparte', () => {
    expect(r.vencido.centavos).toBe(2320000);
    expect(r.vencido.partidas).toBe(2);
    expect(r.vencido.desde).toBe('2026-09-25');
    expect(r.vencido.ajenoCentavos).toBe(2300000);
    expect(r.vencido.sinFacturaCentavos).toBe(0);
  });
  it('próximo pago: lo del mes de la fecha más cercana', () => {
    expect(r.proximo).toEqual({ centavos: 1800000, partidas: 1, fecha: '2026-10-30' });
  });
  it('falta del año: el resto, que todavía no se debe', () => {
    expect(r.falta.centavos).toBe(8 * 1800000);
    expect(r.falta.partidas).toBe(8);
    expect(r.falta.desde).toBe('2026-11-30');
    expect(r.falta.hasta).toBe('2027-06-30');
  });
  it('pagado y total; lo anulado no cuenta', () => {
    expect(r.pagadoCentavos).toBe(1800000);
    expect(r.totalCentavos).toBe(1800000 + 2320000 + 9 * 1800000);
  });
  it('una cuota vencida sin factura se dice aparte', () => {
    const x = resumirCobro([{ saldoCentavos: 500, vence: '2026-10-01', facturada: false }], HOY);
    expect(x.vencido.sinFacturaCentavos).toBe(500);
  });
  it('sin fecha límite se paga ya: va en el próximo pago', () => {
    const x = resumirCobro([{ saldoCentavos: 700, vence: null }], HOY);
    expect(x.proximo).toEqual({ centavos: 700, partidas: 1, fecha: null });
    expect(x.vencido.centavos).toBe(0);
  });
});
