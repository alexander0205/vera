import { test, describe, vi, afterEach } from 'vitest';
import assert from 'node:assert/strict';

vi.mock('@/lib/whatsapp/config', () => ({
  getWhatsAppConfig: vi.fn(),
}));
vi.mock('@/lib/whatsapp/client', async () => {
  const actual = await vi.importActual<typeof import('@/lib/whatsapp/client')>('@/lib/whatsapp/client');
  return { ...actual, enviarMensaje: vi.fn() };
});

import { getWhatsAppConfig } from '@/lib/whatsapp/config';
import { enviarMensaje, WhatsAppApiError } from '@/lib/whatsapp/client';
import { enviarWhatsApp, WhatsAppNoConectadoError, WhatsAppFueraDeVentanaError } from '@/lib/whatsapp/enviar';

describe('enviarWhatsApp', () => {
  afterEach(() => vi.clearAllMocks());

  test('lanza WhatsAppNoConectadoError si el team no tiene config', async () => {
    vi.mocked(getWhatsAppConfig).mockResolvedValue(null);
    await assert.rejects(() => enviarWhatsApp(1, '+18095551234', 'hola'), WhatsAppNoConectadoError);
  });

  test('lanza WhatsAppNoConectadoError si conectado=false', async () => {
    vi.mocked(getWhatsAppConfig).mockResolvedValue({
      negocioId: 'n1', apiKey: 'sk_live_x', webhookSecret: null, conectado: false, numeroWhatsapp: null,
    });
    await assert.rejects(() => enviarWhatsApp(1, '+18095551234', 'hola'), WhatsAppNoConectadoError);
  });

  test('envía y devuelve messageId cuando está conectado', async () => {
    vi.mocked(getWhatsAppConfig).mockResolvedValue({
      negocioId: 'n1', apiKey: 'sk_live_x', webhookSecret: null, conectado: true, numeroWhatsapp: '+1809...',
    });
    vi.mocked(enviarMensaje).mockResolvedValue({ messageId: 'wamid.1', conversationId: 'c1' });
    const r = await enviarWhatsApp(1, '+18095551234', 'hola');
    assert.equal(r.messageId, 'wamid.1');
  });

  test('mapea 422 a WhatsAppFueraDeVentanaError', async () => {
    vi.mocked(getWhatsAppConfig).mockResolvedValue({
      negocioId: 'n1', apiKey: 'sk_live_x', webhookSecret: null, conectado: true, numeroWhatsapp: '+1809...',
    });
    vi.mocked(enviarMensaje).mockRejectedValue(new WhatsAppApiError(422, 'Fuera de ventana de 24h'));
    await assert.rejects(() => enviarWhatsApp(1, '+18095551234', 'hola'), WhatsAppFueraDeVentanaError);
  });

  test('mapea 409 a WhatsAppNoConectadoError', async () => {
    vi.mocked(getWhatsAppConfig).mockResolvedValue({
      negocioId: 'n1', apiKey: 'sk_live_x', webhookSecret: null, conectado: true, numeroWhatsapp: '+1809...',
    });
    vi.mocked(enviarMensaje).mockRejectedValue(new WhatsAppApiError(409, 'no conectado'));
    await assert.rejects(() => enviarWhatsApp(1, '+18095551234', 'hola'), WhatsAppNoConectadoError);
  });

  test('reintenta una vez en 429 y propaga si vuelve a fallar', async () => {
    vi.mocked(getWhatsAppConfig).mockResolvedValue({
      negocioId: 'n1', apiKey: 'sk_live_x', webhookSecret: null, conectado: true, numeroWhatsapp: '+1809...',
    });
    vi.mocked(enviarMensaje).mockRejectedValue(new WhatsAppApiError(429, 'rate limit'));
    await assert.rejects(() => enviarWhatsApp(1, '+18095551234', 'hola'), WhatsAppApiError);
    assert.equal(vi.mocked(enviarMensaje).mock.calls.length, 2);
  });
});
