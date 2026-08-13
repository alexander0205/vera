import { NextRequest, NextResponse } from 'next/server';
import { getUser, getTeamIdForUser } from '@/lib/db/queries';
import { getWhatsAppConfig, actualizarEstadoConexion } from '@/lib/whatsapp/config';
import { generarConnectUrl, WhatsAppApiError } from '@/lib/whatsapp/client';

/**
 * Lectura barata del estado de conexión: solo lo que hay guardado, sin llamar
 * a la API de WhatsApp.
 *
 * El POST de aquí abajo sí sale a preguntar y de paso refresca el guardado,
 * pero es caro y no sirve para pintar una pantalla: los recordatorios de
 * cobro necesitan saber si pueden ofrecer el canal, no reconciliar la cuenta.
 * Devuelve el número enmascarado —la pantalla solo tiene que decir "está
 * conectado", no repetir el teléfono del colegio entero.
 */
export async function GET() {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

  const teamId = await getTeamIdForUser();
  if (!teamId) return NextResponse.json({ error: 'Sin empresa' }, { status: 403 });

  const config = await getWhatsAppConfig(teamId);
  return NextResponse.json({
    configurado: !!config,
    conectado: config?.conectado ?? false,
    numeroWhatsapp: config?.numeroWhatsapp
      ? `••• ${config.numeroWhatsapp.slice(-4)}`
      : null,
  });
}

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
