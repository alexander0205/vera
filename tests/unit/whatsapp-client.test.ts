import { test, describe, vi, beforeEach, afterEach } from 'vitest';
import assert from 'node:assert/strict';

describe('lib/whatsapp/client', () => {
  const realFetch = global.fetch;
  beforeEach(() => {
    process.env.CRM_ZERO_API_URL = 'https://crm.zero.com.do/api/v1';
    process.env.CRM_ZERO_PARTNER_KEY = 'partner-test-key';
  });
  afterEach(() => { global.fetch = realFetch; vi.resetModules(); });

  test('enviarMensaje devuelve messageId/conversationId en 201', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ messageId: 'wamid.1', conversationId: 'conv-1' }),
    }) as unknown as typeof fetch;
    const { enviarMensaje } = await import('@/lib/whatsapp/client');
    const r = await enviarMensaje('sk_live_abc', '+18095551234', 'hola');
    assert.equal(r.messageId, 'wamid.1');
    assert.equal(r.conversationId, 'conv-1');
  });

  test('enviarMensaje lanza WhatsAppApiError con el status HTTP en error', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 422,
      json: async () => ({ error: 'Fuera de ventana de 24h' }),
    }) as unknown as typeof fetch;
    const { enviarMensaje, WhatsAppApiError } = await import('@/lib/whatsapp/client');
    await assert.rejects(
      () => enviarMensaje('sk_live_abc', '+18095551234', 'hola'),
      (err: unknown) => err instanceof WhatsAppApiError && err.status === 422,
    );
  });

  test('crearNegocio lanza 503 si falta CRM_ZERO_PARTNER_KEY', async () => {
    delete process.env.CRM_ZERO_PARTNER_KEY;
    const { crearNegocio, WhatsAppApiError } = await import('@/lib/whatsapp/client');
    await assert.rejects(
      () => crearNegocio('Colegio X', 'colegio@example.com', 'colegio'),
      (err: unknown) => err instanceof WhatsAppApiError && err.status === 503,
    );
  });
});
