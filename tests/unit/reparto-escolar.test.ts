/**
 * Unit tests — reparto del cobro entre cargos escolares.
 * Es dinero: cada caso aquí es una forma concreta en la que el saldo de una
 * familia podía quedar mal.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { repartirCobro, repartirCobroEntreHermanos, ordenarPorVencimiento } from '@/lib/administracion-escolar/reparto';

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

/**
 * Una factura, varios hermanos.
 *
 * El padre paga la colegiatura de sus dos hijos con una sola factura. Lo cobrado
 * hay que repartirlo, y lo justo es por hijo: cada uno con la parte que
 * corresponde a SUS líneas. Antes todo el abono se le iba al primero.
 *
 * Pero ese reparto solo existe si la factura dice de quién es cada línea. La
 * primera versión no tenía salida para la que no lo dice, y al hermano sin
 * líneas no le daba nada, ni con la factura PAGADA: sobre una copia de
 * producción, un colegio con 60 facturas familiares ya cobradas pasó 2,023
 * cargos de «pagado» a «vencido» —RD$8.8 millones de deuda que nadie debía— con
 * solo abrir el listado de estudiantes.
 */
describe('repartirCobroEntreHermanos', () => {
  // Dos hermanos; el mes de cada uno, 3,700 y 3,500.
  const ana  = { id: 10, estudianteId: 1, montoCentavos: 3_700_00, fechaVencimiento: '2026-09-30' };
  const luis = { id: 11, estudianteId: 2, montoCentavos: 3_500_00, fechaVencimiento: '2026-09-30' };
  const saldos = (r: { id: number; saldo: number }[]) => Object.fromEntries(r.map(x => [x.id, x.saldo]));
  const estados = (r: { id: number; estado: string }[]) => Object.fromEntries(r.map(x => [x.id, x.estado]));

  it('un solo estudiante: lo mismo que repartirCobro', () => {
    const cargos = [{ ...enero, estudianteId: 1 }, { ...febrero, estudianteId: 1 }];
    expect(repartirCobroEntreHermanos(cargos, 150_00, HOY, new Map([[1, 200_00]])))
      .toEqual(repartirCobro(cargos, 150_00, HOY));
  });

  it('cada hermano con sus líneas y un abono: a cada uno su parte, no todo al primero', () => {
    // La factura trae 3,500 de Ana y 3,300 de Luis, y se cobraron 6,600.
    const r = repartirCobroEntreHermanos([ana, luis], 6_600_00, '2026-10-06', new Map([[1, 3_500_00], [2, 3_300_00]]));
    expect(saldos(r)).toEqual({ 10: 302_94, 11: 297_06 });
    expect(estados(r)).toEqual({ 10: 'parcial', 11: 'parcial' });
    // En cascada, como antes, Ana quedaba saldada y Luis cargaba con todo lo que faltaba.
    expect(saldos(repartirCobro([ana, luis], 6_600_00, '2026-10-06'))).toEqual({ 10: 0, 11: 600_00 });
  });

  it('factura PAGADA sin beneficiario en las líneas: los dos quedan pagados', () => {
    const r = repartirCobroEntreHermanos([ana, luis], 7_200_00, '2026-10-06', new Map(), { facturaSaldada: true });
    expect(saldos(r)).toEqual({ 10: 0, 11: 0 });
    expect(estados(r)).toEqual({ 10: 'pagado', 11: 'pagado' });
  });

  it('factura PAGADA que solo identifica a un hermano: el otro también queda pagado', () => {
    const r = repartirCobroEntreHermanos([ana, luis], 7_200_00, '2026-10-06', new Map([[1, 3_700_00]]), { facturaSaldada: true });
    expect(estados(r)).toEqual({ 10: 'pagado', 11: 'pagado' });
  });

  it('abono a una factura que no dice de quién es cada línea: la cascada de siempre', () => {
    const r = repartirCobroEntreHermanos([ana, luis], 4_000_00, '2026-10-06', new Map());
    expect(r).toEqual(repartirCobro([ana, luis], 4_000_00, '2026-10-06'));
    expect(saldos(r)).toEqual({ 10: 0, 11: 3_200_00 });
  });

  it('factura PAGADA con las líneas de los dos: los dos pagados', () => {
    const r = repartirCobroEntreHermanos([ana, luis], 6_800_00, '2026-10-06', new Map([[1, 3_500_00], [2, 3_300_00]]), { facturaSaldada: true });
    expect(estados(r)).toEqual({ 10: 'pagado', 11: 'pagado' });
  });

  it('factura anulada: cada cargo recupera su saldo y se desliga', () => {
    const r = repartirCobroEntreHermanos([ana, luis], 6_600_00, '2026-10-06', new Map([[1, 3_500_00], [2, 3_300_00]]), { facturaAnulada: true });
    expect(saldos(r)).toEqual({ 10: 3_700_00, 11: 3_500_00 });
    expect(r.every(x => x.desvincular)).toBe(true);
  });

  it('la sincronización usa esta función, no una copia suya', () => {
    // Si alguien vuelve a escribir el reparto dentro de la consulta, las pruebas
    // de arriba dejan de proteger lo que de verdad corre.
    const consulta = readFileSync(join(__dirname, '..', '..', 'lib', 'administracion-escolar', 'queries.ts'), 'utf8');
    expect(consulta).toMatch(/const calculados = repartirCobroEntreHermanos\(/);
    expect(consulta).not.toMatch(/facturaSaldada: saldada && sub > 0/);
  });
});
