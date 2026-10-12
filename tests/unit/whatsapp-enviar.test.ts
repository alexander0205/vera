import { test, describe, vi, afterEach } from 'vitest';
import assert from 'node:assert/strict';

vi.mock('@/lib/whatsapp/config', () => ({
  resolverRemitente: vi.fn(),
}));
vi.mock('@/lib/whatsapp/client', async () => {
  const actual = await vi.importActual<typeof import('@/lib/whatsapp/client')>('@/lib/whatsapp/client');
  return { ...actual, enviarMensaje: vi.fn(), enviarPlantilla: vi.fn() };
});

import { resolverRemitente } from '@/lib/whatsapp/config';
import { enviarMensaje, enviarPlantilla, WhatsAppApiError } from '@/lib/whatsapp/client';
import {
  enviarWhatsApp, enviarWhatsAppPlantilla,
  WhatsAppNoConectadoError, WhatsAppFueraDeVentanaError, WhatsAppPlantillaRechazadaError,
} from '@/lib/whatsapp/enviar';

/** Remitente listo para usar; `propio` distingue número del colegio vs. de Zero. */
function remitente(apiKey = 'sk_live_x', propio = true) {
  return { apiKey, propio };
}

describe('enviarWhatsApp', () => {
  afterEach(() => vi.clearAllMocks());

  test('lanza WhatsAppNoConectadoError si no hay ni número propio ni el de Zero', async () => {
    vi.mocked(resolverRemitente).mockResolvedValue(null);
    await assert.rejects(() => enviarWhatsApp(1, '+18095551234', 'hola'), WhatsAppNoConectadoError);
  });

  test('envía y devuelve messageId', async () => {
    vi.mocked(resolverRemitente).mockResolvedValue(remitente());
    vi.mocked(enviarMensaje).mockResolvedValue({ messageId: 'wamid.1', conversationId: 'c1' });
    const r = await enviarWhatsApp(1, '+18095551234', 'hola');
    assert.equal(r.messageId, 'wamid.1');
  });

  test('usa la llave que le dé el remitente — la de Zero cuando el colegio no tiene la suya', async () => {
    vi.mocked(resolverRemitente).mockResolvedValue(remitente('sk_live_zero', false));
    vi.mocked(enviarMensaje).mockResolvedValue({ messageId: 'wamid.2', conversationId: 'c2' });
    await enviarWhatsApp(1, '+18095551234', 'hola');
    assert.equal(vi.mocked(enviarMensaje).mock.calls[0][0], 'sk_live_zero');
  });

  test('mapea 422 a WhatsAppFueraDeVentanaError', async () => {
    vi.mocked(resolverRemitente).mockResolvedValue(remitente());
    vi.mocked(enviarMensaje).mockRejectedValue(new WhatsAppApiError(422, 'Fuera de ventana de 24h'));
    await assert.rejects(() => enviarWhatsApp(1, '+18095551234', 'hola'), WhatsAppFueraDeVentanaError);
  });

  test('mapea 409 a WhatsAppNoConectadoError', async () => {
    vi.mocked(resolverRemitente).mockResolvedValue(remitente());
    vi.mocked(enviarMensaje).mockRejectedValue(new WhatsAppApiError(409, 'no conectado'));
    await assert.rejects(() => enviarWhatsApp(1, '+18095551234', 'hola'), WhatsAppNoConectadoError);
  });

  test('reintenta una vez en 429 y propaga si vuelve a fallar', async () => {
    vi.mocked(resolverRemitente).mockResolvedValue(remitente());
    vi.mocked(enviarMensaje).mockRejectedValue(new WhatsAppApiError(429, 'rate limit'));
    await assert.rejects(() => enviarWhatsApp(1, '+18095551234', 'hola'), WhatsAppApiError);
    assert.equal(vi.mocked(enviarMensaje).mock.calls.length, 2);
  });
});

describe('enviarWhatsAppPlantilla', () => {
  afterEach(() => vi.clearAllMocks());

  const PLANTILLA = { nombre: 'factura_lista', parametros: ['Mensualidad', 'Juan Pérez'] };

  test('manda la plantilla con su nombre y parámetros', async () => {
    vi.mocked(resolverRemitente).mockResolvedValue(remitente());
    vi.mocked(enviarPlantilla).mockResolvedValue({ messageId: 'wamid.9', conversationId: 'c9' });
    const r = await enviarWhatsAppPlantilla(1, '+18095551234', PLANTILLA);
    assert.equal(r.messageId, 'wamid.9');
    assert.deepEqual(vi.mocked(enviarPlantilla).mock.calls[0][2], PLANTILLA);
  });

  test('sin remitente lanza WhatsAppNoConectadoError', async () => {
    vi.mocked(resolverRemitente).mockResolvedValue(null);
    await assert.rejects(() => enviarWhatsAppPlantilla(1, '+18095551234', PLANTILLA), WhatsAppNoConectadoError);
  });

  test('422 es plantilla rechazada, NO fuera de ventana', async () => {
    // Una plantilla no tiene ventana de 24 h: si Meta la rechaza es porque no
    // existe, no está aprobada o le faltan parámetros. Confundirlo mandaría a
    // esperar a que conteste el padre en vez de a mirar Meta.
    vi.mocked(resolverRemitente).mockResolvedValue(remitente());
    vi.mocked(enviarPlantilla).mockRejectedValue(new WhatsAppApiError(422, 'template not found'));
    await assert.rejects(
      () => enviarWhatsAppPlantilla(1, '+18095551234', PLANTILLA),
      (e: unknown) => e instanceof WhatsAppPlantillaRechazadaError
        && !(e instanceof WhatsAppFueraDeVentanaError)
        && e.plantilla === 'factura_lista',
    );
  });

  test('409 sigue siendo WhatsAppNoConectadoError', async () => {
    vi.mocked(resolverRemitente).mockResolvedValue(remitente());
    vi.mocked(enviarPlantilla).mockRejectedValue(new WhatsAppApiError(409, 'no conectado'));
    await assert.rejects(() => enviarWhatsAppPlantilla(1, '+18095551234', PLANTILLA), WhatsAppNoConectadoError);
  });
});
