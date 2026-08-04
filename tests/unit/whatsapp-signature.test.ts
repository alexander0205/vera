import { test, describe } from 'vitest';
import assert from 'node:assert/strict';
import { createHmac } from 'crypto';
import { verificarFirma } from '@/lib/whatsapp/signature';

describe('verificarFirma', () => {
  const secret = 'un-secret-de-prueba';
  const rawBody = JSON.stringify({ event: 'message.received', from: '18095559999', text: 'hola' });

  test('acepta una firma HMAC-SHA256 válida', () => {
    const firmaValida = 'sha256=' + createHmac('sha256', secret).update(rawBody).digest('hex');
    assert.equal(verificarFirma(rawBody, secret, firmaValida), true);
  });

  test('rechaza una firma con secret incorrecto', () => {
    const firmaOtroSecret = 'sha256=' + createHmac('sha256', 'otro-secret').update(rawBody).digest('hex');
    assert.equal(verificarFirma(rawBody, secret, firmaOtroSecret), false);
  });

  test('rechaza si el body fue alterado después de firmar', () => {
    const firma = 'sha256=' + createHmac('sha256', secret).update(rawBody).digest('hex');
    assert.equal(verificarFirma(rawBody + 'x', secret, firma), false);
  });

  test('rechaza si no hay header de firma', () => {
    assert.equal(verificarFirma(rawBody, secret, null), false);
  });
});
