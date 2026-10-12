/**
 * La conexión de WhatsApp de Zero — el número por el que salen los avisos de
 * todo colegio que no tenga el suyo.
 *
 *   POST   → pide al CRM un enlace de conexión (dura 24 h, lleva al popup de
 *            Meta). Vale igual para conectar por primera vez que para terminar
 *            de activar un número que quedó vinculado sin registrar.
 *   DELETE → suelta el canal: desuscribe la WABA en Meta y borra credenciales.
 *            Las conversaciones se conservan.
 *
 * El token del enlace va en la URL, así que no se guarda ni se registra.
 */

import { NextResponse } from 'next/server';
import { generarConnectUrl, desconectarWhatsApp, WhatsAppApiError } from '@/lib/whatsapp/client';
import { requireAdminConLlave } from '@/lib/whatsapp/admin-guard';

export async function POST() {
  const auth = await requireAdminConLlave();
  if (!auth.ok) return auth.response;

  try {
    const r = await generarConnectUrl(auth.apiKey);
    return NextResponse.json({
      connectUrl: r.connectUrl,
      expiraEnHoras: r.expiresInHours ?? 24,
      puedeEnviar: r.whatsappCanSend ?? null,
      estado: r.estadoConexion ?? null,
      numero: r.displayPhoneNumber || null,
    });
  } catch (e) {
    const status = e instanceof WhatsAppApiError ? e.status : 502;
    const error  = e instanceof Error ? e.message : 'Error consultando el CRM';
    console.error('[admin whatsapp conectar]', error);
    return NextResponse.json({ error }, { status });
  }
}

export async function DELETE() {
  const auth = await requireAdminConLlave();
  if (!auth.ok) return auth.response;

  try {
    await desconectarWhatsApp(auth.apiKey);
    // Se registra porque deja sin avisos a TODOS los colegios que no tienen
    // número propio, y conviene poder fechar cuándo empezó eso.
    console.warn('[admin whatsapp] canal de Zero DESCONECTADO');
    return NextResponse.json({ ok: true });
  } catch (e) {
    const status = e instanceof WhatsAppApiError ? e.status : 502;
    const error  = e instanceof Error ? e.message : 'Error desconectando';
    console.error('[admin whatsapp desconectar]', error);
    return NextResponse.json({ error }, { status });
  }
}
