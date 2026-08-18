/**
 * Las funciones puras del catálogo de plantillas.
 *
 * `deducirVariables` corre en cada tecleo del editor y `renderizar` decide qué
 * lee la persona antes de mandar una plantilla a Meta — donde ya no se puede
 * editar. Los dos sitios donde un despiste sale caro.
 */

import { test, describe } from 'vitest';
import assert from 'node:assert/strict';
import { contarVariables, renderizar, deducirVariables } from '@/lib/whatsapp/catalogo';
import type { VariablePlantilla } from '@/lib/db/schema';

const v = (pos: number, nombre: string, ejemplo: string): VariablePlantilla =>
  ({ pos, nombre, tipo: 'texto', ejemplo });

describe('contarVariables', () => {
  test('cuenta posiciones distintas, no apariciones', () => {
    assert.equal(contarVariables('Hola {{1}}, tu factura {{2}} vence {{3}}.'), 3);
    // {{1}} dos veces sigue siendo UNA variable: Meta pide un ejemplo por
    // posición, no por aparición.
    assert.equal(contarVariables('{{1}} y otra vez {{1}}'), 1);
  });

  test('sin variables, cero', () => {
    assert.equal(contarVariables('Texto fijo sin nada'), 0);
  });
});

describe('renderizar', () => {
  test('sustituye cada variable por su ejemplo', () => {
    const r = renderizar('Hola {{1}}, debes {{2}}.', [v(1, 'nombre', 'María'), v(2, 'monto', 'RD$1,500')]);
    assert.equal(r, 'Hola María, debes RD$1,500.');
  });

  test('una variable sin ejemplo se deja a la vista', () => {
    // Borrarla dejaría una frase que se lee bien y que en el envío real sale
    // incompleta. Que se vea el hueco es el aviso.
    assert.equal(renderizar('Hola {{1}}, debes {{2}}.', [v(1, 'nombre', 'María')]),
      'Hola María, debes {{2}}.');
  });

  test('un ejemplo en blanco cuenta como sin ejemplo', () => {
    assert.equal(renderizar('Hola {{1}}', [v(1, 'nombre', '   ')]), 'Hola {{1}}');
  });

  test('repetida se sustituye en todas sus apariciones', () => {
    assert.equal(renderizar('{{1}} y {{1}}', [v(1, 'n', 'Ana')]), 'Ana y Ana');
  });
});

describe('deducirVariables', () => {
  test('las saca del cuerpo, ordenadas', () => {
    const r = deducirVariables('Debes {{2}} por {{1}}', []);
    assert.deepEqual(r.map((x) => x.pos), [1, 2]);
  });

  test('CONSERVA nombre y ejemplo de las que ya estaban', () => {
    // Es lo que evita que escribir una coma después de {{1}} borre el nombre y
    // el ejemplo que la persona acaba de teclear.
    const previas = [v(1, 'concepto', 'Mensualidad')];
    const r = deducirVariables('{{1}} cuesta {{2}}', previas);
    assert.equal(r[0].nombre, 'concepto');
    assert.equal(r[0].ejemplo, 'Mensualidad');
    assert.equal(r[1].nombre, 'variable 2');
  });

  test('quita las que ya no están en el cuerpo', () => {
    const r = deducirVariables('Solo {{1}}', [v(1, 'a', 'x'), v(2, 'b', 'y')]);
    assert.deepEqual(r.map((x) => x.pos), [1]);
  });

  test('no duplica una repetida', () => {
    assert.equal(deducirVariables('{{1}} y {{1}}', []).length, 1);
  });
});
