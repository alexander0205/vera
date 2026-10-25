/**
 * El reparto de avisos en los cinco huecos de plantilla.
 *
 * Tiene que decidir igual que las ramas de `redactar()` en
 * lib/administracion-escolar/avisos.ts. Si se separan, a un padre con cinco
 * días de gracia le llega «ya se aplicó el recargo».
 */

import { test, describe } from 'vitest';
import assert from 'node:assert/strict';
import { huecoDe, AVISOS_PLANTILLA, plantillaParaEnviar, type PlantillaAsignada } from '@/lib/whatsapp/plantillas';

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
describe('plantillaParaEnviar: versión con o sin enlace, y nunca texto libre', () => {
  const CONFIG: PlantillaAsignada = {
    aviso: 'al-emitir',
    nombre: 'factura_lista',
    idioma: 'es',
    propia: false,
    nombreConLink: 'factura_lista_con_boton',
    conBoton: false,
    conLinkTieneBoton: true,
  };

  test('con factura emitida manda la del botón', () => {
    const r = plantillaParaEnviar(CONFIG, true, true);
    assert.equal(r?.nombre, 'factura_lista_con_boton');
    assert.equal(r?.conBoton, true);
  });

  test('sin factura manda la de siempre, sin botón', () => {
    const r = plantillaParaEnviar(CONFIG, false, true);
    assert.equal(r?.nombre, 'factura_lista');
    assert.equal(r?.conBoton, false);
  });

  /** El colegio que no configuró la segunda usa la misma para los dos casos. */
  test('sin versión con enlace configurada usa la de siempre aunque haya factura', () => {
    const r = plantillaParaEnviar({ ...CONFIG, nombreConLink: null }, true, true);
    assert.equal(r?.nombre, 'factura_lista');
    assert.equal(r?.conBoton, false);
  });

  /**
   * El 25-10-2026 Mi Casita no tenía plantilla asignada y los avisos salieron
   * en texto libre: Meta rechazó casi todos (131047, fuera de las 24 h).
   * Sin plantilla no sale WhatsApp; el correo y el SMS sí.
   */
  test('sin plantilla asignada no se manda nada (nunca texto libre)', () => {
    assert.equal(plantillaParaEnviar(null, true, true), null);
    assert.equal(plantillaParaEnviar(null, false, true), null);
  });

  /**
   * Pedir el botón sin enlace que ponerle: Meta rechaza la plantilla por
   * parámetros. Antes caía al texto libre; ahora no sale.
   */
  test('una plantilla con botón sin enlace no se manda', () => {
    const conBotonPropio = { ...CONFIG, conBoton: true, nombreConLink: null };
    assert.equal(plantillaParaEnviar(conBotonPropio, false, true), null);
    assert.equal(plantillaParaEnviar(conBotonPropio, true, true)?.nombre, 'factura_lista');
  });

  test('con botón y un CRM que no rellena botones no se manda', () => {
    assert.equal(plantillaParaEnviar(CONFIG, true, false), null);
    // La de siempre, sin botón, sí sale aunque el CRM no soporte botones.
    assert.equal(plantillaParaEnviar(CONFIG, false, false)?.nombre, 'factura_lista');
  });
});
