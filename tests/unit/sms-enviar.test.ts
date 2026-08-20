/**
 * `publicarSms` está mockeado en TODOS los casos: ninguna prueba de este archivo
 * puede llegar a AWS. Si algún día un test falla con un error de credenciales,
 * es que el mock se rompió — no que falten credenciales.
 */
import { test, describe, vi, beforeEach, afterEach } from 'vitest';
import assert from 'node:assert/strict';

vi.mock('@/lib/sms/client', async () => {
  const actual = await vi.importActual<typeof import('@/lib/sms/client')>('@/lib/sms/client');
  return { ...actual, publicarSms: vi.fn(), snsConfigurado: vi.fn(() => true) };
});

import { publicarSms, snsConfigurado, SmsApiError } from '@/lib/sms/client';
import {
  enviarSms,
  SmsDeshabilitadoError,
  SmsTelefonoInvalidoError,
  SmsTextoVacioError,
  SmsTextoLargoError,
  SmsEnvioError,
} from '@/lib/sms/enviar';

const TEAM = 9;
const TEXTO = 'Colegio Andres Bello: mensualidad de Junio vence el 05/06.';

describe('enviarSms', () => {
  const envOriginal = { ...process.env };

  beforeEach(() => {
    process.env.SMS_SNS_KEY_ID = 'AKIA-TEST';
    process.env.SMS_SNS_SECRET = 'secreto-de-prueba';
    vi.mocked(publicarSms).mockResolvedValue({ messageId: 'msg-1' });
    vi.mocked(snsConfigurado).mockReturnValue(true);
  });
  afterEach(() => {
    process.env = { ...envOriginal };
    vi.clearAllMocks();
  });

  test('sin credenciales no manda nada, y no llega a llamar a SNS', async () => {
    vi.mocked(snsConfigurado).mockReturnValueOnce(false);
    await assert.rejects(
      () => enviarSms(TEAM, '8095551234', TEXTO),
      (err: unknown) => err instanceof SmsDeshabilitadoError && err.motivo === 'sin-credenciales',
    );
    assert.equal(vi.mocked(publicarSms).mock.calls.length, 0);
  });

  test('con credenciales manda para cualquier empresa', async () => {
    const r = await enviarSms(123, '8095551234', TEXTO);
    assert.equal(r.messageId, 'msg-1');
  });

  test('normaliza el teléfono antes de publicar', async () => {
    const r = await enviarSms(TEAM, '(809) 555-1234', TEXTO);
    assert.equal(r.telefono, '+18095551234');
    assert.deepEqual(vi.mocked(publicarSms).mock.calls[0], ['+18095551234', TEXTO]);
  });

  test('teléfono que no se puede normalizar → error tipado, sin llamar a SNS', async () => {
    await assert.rejects(() => enviarSms(TEAM, '555-1234', TEXTO), SmsTelefonoInvalidoError);
    await assert.rejects(() => enviarSms(TEAM, 'no tiene', TEXTO), SmsTelefonoInvalidoError);
    await assert.rejects(() => enviarSms(TEAM, null, TEXTO), SmsTelefonoInvalidoError);
    assert.equal(vi.mocked(publicarSms).mock.calls.length, 0);
  });

  test('texto vacío o en blanco no se envía', async () => {
    await assert.rejects(() => enviarSms(TEAM, '8095551234', ''), SmsTextoVacioError);
    await assert.rejects(() => enviarSms(TEAM, '8095551234', '   '), SmsTextoVacioError);
    assert.equal(vi.mocked(publicarSms).mock.calls.length, 0);
  });

  test('un texto larguísimo se rechaza, no se corta', async () => {
    await assert.rejects(
      () => enviarSms(TEAM, '8095551234', 'a'.repeat(1000)),
      (err: unknown) => err instanceof SmsTextoLargoError && err.partes === 7 && err.maximo === 4,
    );
    assert.equal(vi.mocked(publicarSms).mock.calls.length, 0);
  });

  test('SMS_MAX_PARTES ajusta el tope', async () => {
    process.env.SMS_MAX_PARTES = '1';
    await assert.rejects(() => enviarSms(TEAM, '8095551234', 'a'.repeat(200)), SmsTextoLargoError);
  });

  test('devuelve el costo real del envío (partes y codificación)', async () => {
    const r = await enviarSms(TEAM, '8095551234', TEXTO);
    assert.equal(r.partes, 1);
    assert.equal(r.codificacion, 'GSM-7');

    const conTilde = await enviarSms(TEAM, '8095551234', 'Matrícula ' + 'a'.repeat(100));
    assert.equal(conTilde.codificacion, 'UCS-2');
    assert.equal(conTilde.partes, 2);
  });

  test('un fallo de SNS sale como SmsEnvioError conservando el código de AWS', async () => {
    vi.mocked(publicarSms).mockRejectedValue(
      new SmsApiError('InvalidParameterException', 400, 'Invalid parameter: PhoneNumber'),
    );
    await assert.rejects(
      () => enviarSms(TEAM, '8095551234', TEXTO),
      (err: unknown) =>
        err instanceof SmsEnvioError && err.codigo === 'InvalidParameterException' && err.status === 400,
    );
  });

  test('un error que no es de SNS se propaga tal cual', async () => {
    const raro = new TypeError('fetch failed');
    vi.mocked(publicarSms).mockRejectedValue(raro);
    await assert.rejects(() => enviarSms(TEAM, '8095551234', TEXTO), TypeError);
  });
});
