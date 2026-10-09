/**
 * El reparto de avisos en los cinco huecos de plantilla.
 *
 * Tiene que decidir igual que las ramas de `redactar()` en
 * lib/administracion-escolar/avisos.ts. Si se separan, a un padre con cinco
 * días de gracia le llega «ya se aplicó el recargo».
 */

import { test, describe } from 'vitest';
import assert from 'node:assert/strict';
import { huecoDe, AVISOS_PLANTILLA } from '@/lib/whatsapp/plantillas';

describe('huecoDe', () => {
  test('al-emitir no depende de la mora', () => {
    assert.equal(huecoDe('al-emitir', true, 5), 'al-emitir');
    assert.equal(huecoDe('al-emitir', false, 0), 'al-emitir');
  });

  test('antes-mora tampoco', () => {
    assert.equal(huecoDe('antes-mora', true, 5), 'antes-mora');
    assert.equal(huecoDe('antes-mora', false, 0), 'antes-mora');
  });

  test('al-vencer con mora y días de gracia → todavía puede evitarlo', () => {
    assert.equal(huecoDe('al-vencer', true, 5), 'al-vencer-con-gracia');
    assert.equal(huecoDe('al-vencer', true, 1), 'al-vencer-con-gracia');
  });

  test('al-vencer con mora y CERO gracia → el recargo ya entró', () => {
    assert.equal(huecoDe('al-vencer', true, 0), 'al-vencer-con-recargo');
  });

  test('al-vencer sin mora → no hay recargo que mencionar', () => {
    // Aunque venga con días de gracia configurados: si el concepto no cobra
    // mora, esos días no significan nada y hablar de recargo sería mentir.
    assert.equal(huecoDe('al-vencer', false, 0), 'al-vencer-sin-mora');
    assert.equal(huecoDe('al-vencer', false, 5), 'al-vencer-sin-mora');
  });

  test('todo hueco que devuelve existe en el catálogo', () => {
    const claves = new Set(AVISOS_PLANTILLA.map((a) => a.clave));
    for (const momento of ['al-emitir', 'al-vencer', 'antes-mora'] as const) {
      for (const cobra of [true, false]) {
        for (const gracia of [0, 1, 5]) {
          assert.ok(claves.has(huecoDe(momento, cobra, gracia)));
        }
      }
    }
  });

  test('el catálogo tiene los 5 huecos, sin repetir', () => {
    assert.equal(AVISOS_PLANTILLA.length, 5);
    assert.equal(new Set(AVISOS_PLANTILLA.map((a) => a.clave)).size, 5);
  });
});

/**
 * Cuál de las dos versiones sale.
 *
 * La regla es del negocio, no estética: un cargo SIN factura no se puede
 * cobrar —el cobro es de un documento— así que mandarle el enlace lleva al
 * padre a transferir y subir su comprobante para que el colegio no pueda
 * aplicarlo. Le queda el pago en el aire.
 */
describe('elegir versión con o sin enlace', () => {
  /** La misma decisión que toma el cron, aislada para poder probarla. */
  function elegir(
    p: { nombre: string; nombreConLink: string | null; conBoton: boolean; conLinkTieneBoton: boolean } | null,
    enlace: string | null,
  ) {
    const usarConLink = enlace != null && p?.nombreConLink != null;
    return {
      nombre: usarConLink ? p!.nombreConLink! : p?.nombre,
      necesitaBoton: usarConLink ? p!.conLinkTieneBoton : p?.conBoton === true,
    };
  }

  const CONFIG = {
    nombre: 'factura_lista',
    nombreConLink: 'factura_lista_con_boton',
    conBoton: false,
    conLinkTieneBoton: true,
  };

  test('con factura emitida manda la del botón', () => {
    const r = elegir(CONFIG, 'https://zero/pagar/abc');
    assert.equal(r.nombre, 'factura_lista_con_boton');
    assert.equal(r.necesitaBoton, true);
  });

  test('sin factura manda la de siempre, sin botón', () => {
    const r = elegir(CONFIG, null);
    assert.equal(r.nombre, 'factura_lista');
    assert.equal(r.necesitaBoton, false);
  });

  /** El colegio que no configuró la segunda usa la misma para los dos casos. */
  test('sin versión con enlace configurada usa la de siempre aunque haya factura', () => {
    const r = elegir({ ...CONFIG, nombreConLink: null }, 'https://zero/pagar/abc');
    assert.equal(r.nombre, 'factura_lista');
    assert.equal(r.necesitaBoton, false);
  });

  /**
   * El caso que rompe el envío: pedir el botón sin tener enlace que ponerle.
   * Meta rechaza la plantilla por parámetros y el aviso no sale.
   */
  test('nunca pide botón cuando no hay enlace', () => {
    for (const p of [CONFIG, { ...CONFIG, conBoton: true, nombreConLink: null }]) {
      const r = elegir(p, null);
      if (r.necesitaBoton) {
        assert.equal(p.conBoton, true, 'solo si la de siempre YA tenía botón propio');
      }
    }
    assert.equal(elegir(CONFIG, null).necesitaBoton, false);
  });

  test('sin plantilla asignada no manda nada por plantilla', () => {
    assert.equal(elegir(null, 'https://zero/pagar/abc').nombre, undefined);
  });
});
