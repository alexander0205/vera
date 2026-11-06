import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import {
  REPRODUCCION_NUEVA, acumularReproduccion, debeGuardarAvance, enCurso, esVisto, minimoReproducido, type Reproduccion,
} from '@/lib/academia/progreso';

/** Reproduce posiciones en orden, como los timeupdate de un video. */
const ver = (posiciones: number[], inicio: Reproduccion = REPRODUCCION_NUEVA) => posiciones.reduce(acumularReproduccion, inicio);

describe('acumularReproduccion', () => {
  it('suma los pasos normales de la reproducción', () => {
    assert.equal(ver([0, 0.25, 0.5, 0.75, 1]).total, 1);
  });
  it('un salto no suma: caer al final por un enlace con ?t= no cuenta como haber visto', () => {
    assert.equal(ver([100, 100.25, 100.5]).total, 0.5);
  });
  it('saltar hacia atrás tampoco suma', () => {
    assert.equal(ver([50, 50.5, 10, 10.5]).total, 1);
  });
  it('ignora valores que no son números', () => {
    assert.equal(ver([1, Number.NaN, 1.5]).total, 0.5);
  });
});

describe('esVisto', () => {
  const base = { duracion: 200, terminado: false };
  it('un salto cerca del final, sin reproducir, NO marca el video como visto', () => {
    assert.equal(esVisto({ ...base, posicion: 195, reproducidoSeg: 0.5, terminado: false }), false);
    assert.equal(esVisto({ ...base, posicion: 200, reproducidoSeg: 1, terminado: true }), false);
  });
  it('verlo de verdad hasta el 90 % sí', () => {
    assert.equal(esVisto({ ...base, posicion: 185, reproducidoSeg: 150 }), true);
  });
  it('terminarlo habiendo reproducido lo suficiente sí', () => {
    assert.equal(esVisto({ ...base, posicion: 200, reproducidoSeg: 60, terminado: true }), true);
  });
  it('reproducir bastante pero parar a la mitad no', () => {
    assert.equal(esVisto({ ...base, posicion: 100, reproducidoSeg: 100 }), false);
  });
  it('el mínimo se queda entre 3 y 30 segundos', () => {
    assert.equal(minimoReproducido(5), 3);
    assert.equal(minimoReproducido(100), 20);
    assert.equal(minimoReproducido(3600), 30);
    assert.equal(minimoReproducido(0), 3);
  });
});

describe('debeGuardarAvance', () => {
  it('llegar por un enlace y salir sin reproducir no pisa el avance guardado', () => {
    assert.equal(debeGuardarAvance(0), false);
    assert.equal(debeGuardarAvance(1.5), false);
    assert.equal(debeGuardarAvance(3), true);
  });
});

describe('enCurso', () => {
  const v = (id: number, avanceSeg: number, visto = false, duracionSeg = 100) => ({ id, avanceSeg, visto, duracionSeg });
  it('solo los empezados y sin terminar, el de más avance primero', () => {
    const r = enCurso([v(1, 0), v(2, 40), v(3, 10), v(4, 50, true), v(5, 99)]);
    assert.deepEqual(r.map((x) => x.id), [2, 3]);
  });
});
