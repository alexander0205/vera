import { NextRequest, NextResponse } from 'next/server';
import { getUser, getTeamIdForUser } from '@/lib/db/queries';
import { getWhatsAppConfig, actualizarEstadoConexion } from '@/lib/whatsapp/config';
import { generarConnectUrl, WhatsAppApiError } from '@/lib/whatsapp/client';

export async function POST(_request: NextRequest) {
  try {
    const user = await getUser();
    if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

    const teamId = await getTeamIdForUser();
    if (!teamId) return NextResponse.json({ error: 'Sin empresa' }, { status: 403 });

    const config = await getWhatsAppConfig(teamId);
    if (!config) {
      return NextResponse.json({ configurado: false });
    }

    let estado;
    try {
      estado = await generarConnectUrl(config.apiKey);
    } catch (err) {
      if (err instanceof WhatsAppApiError) {
        return NextResponse.json({ error: err.message }, { status: err.status });
      }
      throw err;
    }

    await actualizarEstadoConexion(teamId, estado.whatsappConnected, estado.displayPhoneNumber ?? null);

    return NextResponse.json({
      configurado: true,
      conectado: estado.whatsappConnected,
      numeroWhatsapp: estado.displayPhoneNumber ?? null,
      connectUrl: estado.connectUrl,
    });
  } catch (err) {
    console.error('[POST /api/whatsapp/estado]', err);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}
