/**
 * El interruptor de SMS. Sin mocks a propósito: lo que se prueba es
 * exactamente la combinación de variables de entorno que va a haber en Vercel.
 *
 * Quién manda y quién no se decide por concepto, con `avisoSms`. Aquí solo se
 * comprueba lo único que puede impedirlo desde la infraestructura: que falten
 * las credenciales.
 */
import { test, describe, beforeEach, afterEach, vi } from 'vitest';
import assert from 'node:assert/strict';

describe('lib/sms/config — si se puede mandar', () => {
  const envOriginal = { ...process.env };

  beforeEach(() => {
    process.env.SMS_SNS_KEY_ID = 'AKIA-TEST';
    process.env.SMS_SNS_SECRET = 'secreto-de-prueba';
  });
  afterEach(() => {
    process.env = { ...envOriginal };
    vi.resetModules();
  });

  test('con credenciales puestas, cualquier empresa puede mandar', async () => {
    const { smsHabilitado, motivoDeshabilitado } = await import('@/lib/sms/config');
    assert.equal(await smsHabilitado(9), true);
    assert.equal(await motivoDeshabilitado(9), null);
    assert.equal(await smsHabilitado(999), true);
  });

  test('sin credenciales no manda nadie, y el motivo lo dice', async () => {
    delete process.env.SMS_SNS_SECRET;
    const { smsHabilitado, motivoDeshabilitado } = await import('@/lib/sms/config');
    assert.equal(await smsHabilitado(9), false);
    assert.equal(await motivoDeshabilitado(9), 'sin-credenciales');
  });

  test('falta la llave y tampoco manda: hacen falta las dos', async () => {
    delete process.env.SMS_SNS_KEY_ID;
    const { motivoDeshabilitado } = await import('@/lib/sms/config');
    assert.equal(await motivoDeshabilitado(9), 'sin-credenciales');
  });

  test('maxPartes por defecto es 4 y SMS_MAX_PARTES lo cambia', async () => {
    delete process.env.SMS_MAX_PARTES;
    const { maxPartes } = await import('@/lib/sms/config');
    assert.equal(maxPartes(), 4);
    process.env.SMS_MAX_PARTES = '2';
    assert.equal(maxPartes(), 2);
    process.env.SMS_MAX_PARTES = 'muchas'; // basura → vuelve al default
    assert.equal(maxPartes(), 4);
  });
});
