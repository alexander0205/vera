/**
 * Unit tests — reparto del cobro entre cargos escolares.
 * Es dinero: cada caso aquí es una forma concreta en la que el saldo de una
 * familia podía quedar mal.
 */

import { describe, it, expect } from 'vitest';
import { repartirCobro, ordenarPorVencimiento } from '@/lib/administracion-escolar/reparto';

const HOY = '2026-07-20';

// Enero vence antes que febrero; marzo aún no vence.
const enero   = { id: 1, montoCentavos: 100_00, fechaVencimiento: '2026-01-31' };
const febrero = { id: 2, montoCentavos: 100_00, fechaVencimiento: '2026-02-28' };
const futuro  = { id: 3, montoCentavos: 100_00, fechaVencimiento: '2026-12-31' };

describe('ordenarPorVencimiento', () => {
  it('el más viejo primero; sin vencimiento al final', () => {
    const sinVenc = { id: 9, montoCentavos: 500, fechaVencimiento: null };
    const orden = ordenarPorVencimiento([futuro, sinVenc, enero, febrero]);
    expect(orden.map(c => c.id)).toEqual([1, 2, 3, 9]);
  });

  it('no muta la lista original', () => {
    const lista = [febrero, enero];
    ordenarPorVencimiento(lista);
    expect(lista.map(c => c.id)).toEqual([2, 1]);
  });
});

describe('repartirCobro — cascada', () => {
  it('sin cobro, cada cargo conserva su saldo; vencido si pasó la fecha', () => {
    const r = repartirCobro([enero, futuro], 0, HOY);
    expect(r).toEqual([
      { id: 1, saldo: 100_00, estado: 'vencido',   desvincular: false },
      { id: 3, saldo: 100_00, estado: 'pendiente', desvincular: false },
    ]);
  });

  it('el cobro salda los más viejos primero', () => {
    const r = repartirCobro([enero, febrero], 100_00, HOY);
    expect(r[0]).toMatchObject({ id: 1, saldo: 0, estado: 'pagado' });
    expect(r[1]).toMatchObject({ id: 2, saldo: 100_00, estado: 'vencido' });
  });

  it('un cobro a medias deja el cargo en parcial', () => {
    const r = repartirCobro([enero], 30_00, HOY);
    expect(r[0]).toEqual({ id: 1, saldo: 70_00, estado: 'parcial', desvincular: false });
  });

  it('reparte entre varios estudiantes de la misma factura', () => {
    const r = repartirCobro([enero, febrero], 150_00, HOY);
    expect(r[0]).toMatchObject({ saldo: 0,      estado: 'pagado' });
    expect(r[1]).toMatchObject({ saldo: 50_00,  estado: 'parcial' });
  });
});

describe('repartirCobro — el excedente de la factura no es deuda', () => {
  // Una factura de 118.00 (100 + ITBIS) cubriendo un cargo de 100.00: al
  // cobrarla completa el cargo queda saldado, no con 18.00 encima.
  it('cobrar de más no deja saldo negativo ni sobrante repartido', () => {
    const r = repartirCobro([enero], 118_00, HOY);
    expect(r[0]).toEqual({ id: 1, saldo: 0, estado: 'pagado', desvincular: false });
  });

  it('el tope de cada cargo es su propio monto, no el total de la factura', () => {
    // 236.00 = dos mensualidades de 100 + ITBIS. Ambas quedan saldadas.
    const r = repartirCobro([enero, febrero], 236_00, HOY);
    expect(r.every(x => x.saldo === 0 && x.estado === 'pagado')).toBe(true);
  });
});

describe('repartirCobro — factura anulada', () => {
  it('devuelve el saldo íntegro y desvincula: anular el documento no perdona la deuda', () => {
    const r = repartirCobro([enero, febrero], 200_00, HOY, { facturaAnulada: true });
    expect(r).toEqual([
      { id: 1, saldo: 100_00, estado: 'vencido', desvincular: true },
      { id: 2, saldo: 100_00, estado: 'vencido', desvincular: true },
    ]);
  });

  it('un cargo que aún no vence vuelve a pendiente, no a vencido', () => {
    const r = repartirCobro([futuro], 100_00, HOY, { facturaAnulada: true });
    expect(r[0]).toMatchObject({ saldo: 100_00, estado: 'pendiente', desvincular: true });
  });
});

describe('repartirCobro — factura marcada como saldada', () => {
  it('PAGADA/GRATUITA salda todos sus cargos aunque el ledger no cuadre al centavo', () => {
    const r = repartirCobro([enero, febrero], 0, HOY, { facturaSaldada: true });
    expect(r.every(x => x.saldo === 0 && x.estado === 'pagado')).toBe(true);
  });
});

describe('repartirCobro — bordes', () => {
  it('sin cargos devuelve lista vacía', () => {
    expect(repartirCobro([], 500_00, HOY)).toEqual([]);
  });

  it('un cobrado negativo se trata como cero (no inventa deuda ni la borra)', () => {
    const r = repartirCobro([enero], -50_00, HOY);
    expect(r[0]).toMatchObject({ saldo: 100_00, estado: 'vencido' });
  });

  it('un cargo en cero queda pagado', () => {
    const r = repartirCobro([{ id: 7, montoCentavos: 0, fechaVencimiento: null }], 0, HOY);
    expect(r[0]).toMatchObject({ saldo: 0, estado: 'pagado' });
  });
});
