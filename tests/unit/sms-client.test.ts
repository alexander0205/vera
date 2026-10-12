/**
 * Pruebas del payload que se le manda a SNS. NUNCA se llama a AWS: se verifica
 * lo que *se construiría*, que es lo único que se puede comprobar sin gastar un
 * SMS real contra teléfonos de padres de familia.
 */
import { test, describe, beforeEach, afterEach, vi } from 'vitest';
import assert from 'node:assert/strict';

describe('lib/sms/client — construirPublishInput', () => {
  const envOriginal = { ...process.env };

  beforeEach(() => {
    process.env.SMS_SNS_REGION = 'us-east-1';
    process.env.SMS_SNS_KEY_ID = 'AKIA-TEST';
    process.env.SMS_SNS_SECRET = 'secreto-de-prueba';
    delete process.env.SMS_SENDER_ID;
  });
  afterEach(() => {
    process.env = { ...envOriginal };
    vi.resetModules();
  });

  test('manda el teléfono en E.164 y el texto tal cual', async () => {
    const { construirPublishInput } = await import('@/lib/sms/client');
    const input = construirPublishInput('+18095551234', 'Aviso de cobro');
    assert.equal(input.PhoneNumber, '+18095551234');
    assert.equal(input.Message, 'Aviso de cobro');
  });

  test('marca el SMS como Transactional, nunca Promotional', async () => {
    const { construirPublishInput } = await import('@/lib/sms/client');
    const attrs = construirPublishInput('+18095551234', 'x').MessageAttributes!;
    assert.equal(attrs['AWS.SNS.SMS.SMSType'].StringValue, 'Transactional');
    assert.equal(attrs['AWS.SNS.SMS.SMSType'].DataType, 'String');
  });

  test('sin SMS_SENDER_ID no manda el atributo SenderID', async () => {
    const { construirPublishInput } = await import('@/lib/sms/client');
    const attrs = construirPublishInput('+18095551234', 'x').MessageAttributes!;
    assert.equal(attrs['AWS.SNS.SMS.SenderID'], undefined);
  });

  test('con SMS_SENDER_ID lo agrega', async () => {
    process.env.SMS_SENDER_ID = 'ColegioAB';
    const { construirPublishInput } = await import('@/lib/sms/client');
    const attrs = construirPublishInput('+18095551234', 'x').MessageAttributes!;
    assert.equal(attrs['AWS.SNS.SMS.SenderID'].StringValue, 'ColegioAB');
  });

  test('snsConfigurado es false si falta cualquiera de las credenciales', async () => {
    delete process.env.SMS_SNS_SECRET;
    const { snsConfigurado } = await import('@/lib/sms/client');
    assert.equal(snsConfigurado(), false);
  });

  test('snsConfigurado es true con key y secret', async () => {
    const { snsConfigurado } = await import('@/lib/sms/client');
    assert.equal(snsConfigurado(), true);
  });
});
