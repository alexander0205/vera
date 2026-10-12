/**
 * GET /api/admin/whatsapp/chats                       → lista de conversaciones
 * GET /api/admin/whatsapp/chats?conversationId=…      → mensajes de una
 *
 * Lee del CRM con la llave de Zero. Solo ve lo que salió y entró por el número
 * de Zero: un colegio que conectó el suyo tiene su propio buzón y su propia
 * llave, y esa no la tenemos.
 */

import { NextRequest, NextResponse } from 'next/server';
import { listarConversaciones, listarMensajes, WhatsAppApiError } from '@/lib/whatsapp/client';
import { requireAdminConLlave } from '@/lib/whatsapp/admin-guard';

export async function GET(request: NextRequest) {
  // Por el mismo portero que las otras seis: era la única que repetía el
  // bloque a mano, y la que se desincroniza es la que deja la llave de
  // WhatsApp de la plataforma al alcance de cualquiera con sesión.
  const auth = await requireAdminConLlave();
  if (!auth.ok) return auth.response;
  const { apiKey } = auth;

  const conversationId = new URL(request.url).searchParams.get('conversationId');

  try {
    if (conversationId) {
      const { messages } = await listarMensajes(apiKey, { conversationId, limit: 100 });
      return NextResponse.json({ messages });
    }
    const { conversations } = await listarConversaciones(apiKey);
    return NextResponse.json({ conversations });
  } catch (e) {
    const status = e instanceof WhatsAppApiError ? e.status : 502;
    const error  = e instanceof Error ? e.message : 'Error consultando el CRM';
    console.error('[admin whatsapp chats]', error);
    return NextResponse.json({ error }, { status });
  }
}
