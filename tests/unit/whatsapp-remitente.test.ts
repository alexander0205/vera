/**
 * Quién aparece como remitente de un aviso.
 *
 * Se prueba `elegirRemitente` y no `resolverRemitente` a propósito: la segunda
 * solo va a buscar la fila a la base y le pasa el resultado a la primera. Toda
 * la decisión está aquí.
 */

import { test, describe } from 'vitest';
import assert from 'node:assert/strict';
import { elegirRemitente } from '@/lib/whatsapp/config';

const LLAVE_ZERO = 'sk_live_zero';

/** Config de un negocio; `conectado` es lo único que decide si su número vale. */
function config(conectado: boolean, apiKey = 'sk_live_colegio') {
  return { negocioId: 'n1', apiKey, webhookSecret: null, conectado, numeroWhatsapp: null };
}

describe('elegirRemitente', () => {
  test('sin número propio sale por el de Zero', () => {
    const r = elegirRemitente(null, LLAVE_ZERO);
    assert.deepEqual(r, { apiKey: LLAVE_ZERO, propio: false });
  });

  test('el número propio gana cuando está conectado', () => {
    const r = elegirRemitente(config(true), LLAVE_ZERO);
    assert.deepEqual(r, { apiKey: 'sk_live_colegio', propio: true });
  });

  test('negocio creado pero número SIN conectar cae al de Zero', () => {
    // Es el estado real de varios negocios en el CRM: existen, tienen llave, y
    // nadie ha pasado por el popup de Meta. Usar su llave da 409.
    const r = elegirRemitente(config(false), LLAVE_ZERO);
    assert.deepEqual(r, { apiKey: LLAVE_ZERO, propio: false });
  });

  test('sin llave de Zero y sin número propio no hay por dónde: null', () => {
    assert.equal(elegirRemitente(null, undefined), null);
    assert.equal(elegirRemitente(config(false), undefined), null);
  });

  test('sin llave de Zero, el número propio conectado sigue sirviendo', () => {
    const r = elegirRemitente(config(true), undefined);
    assert.deepEqual(r, { apiKey: 'sk_live_colegio', propio: true });
  });
});
