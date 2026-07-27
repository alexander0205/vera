/**
 * Tests de `drenarBarrido` — el loop de drenaje del cron de contabilidad.
 *
 * La trampa que justifican: `generarAsientosPendientes` re-selecciona en cada
 * pasada los documentos sin asiento, y los que se saltan a propósito (p. ej.
 * retenciones) NUNCA se asientan, así que mantienen `hayMas` en true para
 * siempre. Un loop que cortara por `hayMas` no terminaría jamás. El corte real
 * es por falta de progreso (`creados === 0`), y eso es justo lo que no se puede
 * ver sin datos y hace falta blindar con un test.
 *
 * Función pura (recibe el runner): sin DB ni navegador. `npm test` (vitest).
 */

import { test, describe } from 'vitest';
import assert from 'node:assert/strict';
import { drenarBarrido } from '@/lib/contabilidad/barrido-cron';
import type { ResumenBarrido } from '@/lib/contabilidad/libro-diario';

const siempre = () => true;
const nunca = () => false;

/** Fabrica un runner que devuelve, en orden, las pasadas dadas. */
function runnerDe(pasadas: ResumenBarrido[]): { correr: () => Promise<ResumenBarrido>; veces: () => number } {
  let i = 0;
  return {
    correr: async () => pasadas[Math.min(i++, pasadas.length - 1)],
    veces: () => i,
  };
}

describe('drenarBarrido — terminación', () => {
  test('para en cuanto una pasada dice hayMas=false', async () => {
    const r = runnerDe([{ creados: 5, saltados: 0, motivos: {}, hayMas: false }]);
    const out = await drenarBarrido(r.correr, { maxPasadas: 50, sigueTiempo: siempre });
    assert.equal(r.veces(), 1);
    assert.equal(out.creados, 5);
    assert.equal(out.pasadas, 1);
    assert.equal(out.truncadoPorTope, false);
    assert.equal(out.truncadoPorTiempo, false);
  });

  test('para sin loop infinito cuando hayMas=true pero creados=0 (solo saltables)', async () => {
    // El caso peligroso: 250 retenciones que nunca se asientan. hayMas se queda
    // en true para siempre; el corte tiene que venir de creados=0.
    const r = runnerDe([{ creados: 0, saltados: 200, motivos: { 'no-es-venta': 200 }, hayMas: true }]);
    const out = await drenarBarrido(r.correr, { maxPasadas: 50, sigueTiempo: siempre });
    assert.equal(r.veces(), 1);
    assert.equal(out.creados, 0);
    assert.equal(out.truncadoPorTope, false);
    assert.equal(out.saltados, 200);
    assert.deepEqual(out.motivos, { 'no-es-venta': 200 });
  });

  test('drena varias pasadas mientras haya progreso, luego para', async () => {
    // Dos pasadas con backlog (200 creados, hayMas true), la tercera limpia.
    const r = runnerDe([
      { creados: 200, saltados: 3, motivos: { 'no-es-venta': 3 }, hayMas: true },
      { creados: 200, saltados: 3, motivos: { 'no-es-venta': 3 }, hayMas: true },
      { creados: 40,  saltados: 3, motivos: { 'no-es-venta': 3 }, hayMas: false },
    ]);
    const out = await drenarBarrido(r.correr, { maxPasadas: 50, sigueTiempo: siempre });
    assert.equal(out.pasadas, 3);
    assert.equal(out.creados, 440);          // suma de las tres
    assert.equal(out.saltados, 3);           // snapshot de la última, no 9
    assert.deepEqual(out.motivos, { 'no-es-venta': 3 });
  });

  test('para por progreso aunque hayMas siga true: 200 creados y luego 0', async () => {
    const r = runnerDe([
      { creados: 200, saltados: 5, motivos: {}, hayMas: true },
      { creados: 0,   saltados: 5, motivos: { 'no-es-venta': 5 }, hayMas: true },
    ]);
    const out = await drenarBarrido(r.correr, { maxPasadas: 50, sigueTiempo: siempre });
    assert.equal(out.pasadas, 2);
    assert.equal(out.creados, 200);
    assert.equal(out.truncadoPorTope, false);
  });
});

describe('drenarBarrido — topes', () => {
  test('respeta maxPasadas y marca truncadoPorTope', async () => {
    // Progreso eterno (siempre crea y siempre hay más): lo corta el tope.
    const r = runnerDe([{ creados: 200, saltados: 0, motivos: {}, hayMas: true }]);
    const out = await drenarBarrido(r.correr, { maxPasadas: 3, sigueTiempo: siempre });
    assert.equal(out.pasadas, 3);
    assert.equal(out.creados, 600);
    assert.equal(out.truncadoPorTope, true);
    assert.equal(out.truncadoPorTiempo, false);
  });

  test('para antes de la primera pasada si no queda tiempo', async () => {
    const r = runnerDe([{ creados: 999, saltados: 0, motivos: {}, hayMas: true }]);
    const out = await drenarBarrido(r.correr, { maxPasadas: 50, sigueTiempo: nunca });
    assert.equal(r.veces(), 0);              // nunca llamó al runner
    assert.equal(out.pasadas, 0);
    assert.equal(out.creados, 0);
    assert.equal(out.truncadoPorTiempo, true);
  });

  test('corta a mitad cuando se agota el tiempo entre pasadas', async () => {
    let llamadas = 0;
    const sigueTiempo = () => llamadas < 2; // deja pasar 2 chequeos, luego corta
    const runner = async (): Promise<ResumenBarrido> => {
      llamadas++;
      return { creados: 200, saltados: 0, motivos: {}, hayMas: true };
    };
    const out = await drenarBarrido(runner, { maxPasadas: 50, sigueTiempo });
    assert.equal(out.pasadas, 2);
    assert.equal(out.creados, 400);
    assert.equal(out.truncadoPorTiempo, true);
  });
});
