import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { getUser, getTeamIdForUser } from '@/lib/db/queries';
import { db } from '@/lib/db/drizzle';
import { whatsappConfig } from '@/lib/db/schema';
import { generarConnectUrl, registrarWebhook, WhatsAppApiError } from '@/lib/whatsapp/client';
import { crearWhatsAppConfig, guardarWebhookSecret, actualizarEstadoConexion } from '@/lib/whatsapp/config';
import { logAudit, getIp } from '@/lib/audit';
import { rateLimitDb } from '@/lib/rate-limit';

/**
 * Enlaza una cuenta de WhatsApp que YA existe en crm-escolar, con su clave.
 *
 * `/api/whatsapp/conectar` solo sabe crear una cuenta nueva, y para eso hace
 * falta una clave de PARTNER. Quien ya tiene su negocio montado allá —porque lo
 * creó antes, o porque se lo montaron— no tiene esa clave: tiene la del
 * negocio, que es la que sirve para mandar mensajes. Con solo el camino de
 * crear, esa cuenta no se podía usar y la única salida era crear una segunda,
 * con otro número.
 *
 * La clave se valida contra crm antes de guardarla: si no vale, crm responde
 * 401 y aquí no se escribe nada. Guardar primero y descubrirlo al primer aviso
 * dejaría al colegio con el canal en verde y sin que salga un solo mensaje.
 */

/**
 * El id del negocio va dentro del token del link de conexión (`escuelaId`).
 *
 * No hay endpoint que lo devuelva —se probaron `/me`, `/negocio`, `/negocios/me`
 * y los tres son 404— y el id no se usa para llamar a nada: se guarda para
 * poder cruzar esta fila con la cuenta de allá cuando algo no cuadre. Por eso
 * un token con otra forma no es motivo para rechazar el enlace.
 */
function negocioIdDelLink(connectUrl: string): string | null {
  try {
    const jwt = connectUrl.split('/').pop() ?? '';
    const payload = jwt.split('.')[1];
    if (!payload) return null;
    const json = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return typeof json.escuelaId === 'string' ? json.escuelaId : null;
  } catch {
    return null;
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getUser();
    if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

    const teamId = await getTeamIdForUser();
    if (!teamId) return NextResponse.json({ error: 'Sin empresa' }, { status: 403 });

    const rl = await rateLimitDb(`whatsapp_enlazar:${teamId}`, 10, 60 * 60_000);
    if (!rl.allowed) {
      return NextResponse.json({ error: 'Demasiados intentos. Espera un momento.' }, { status: 429 });
    }

    const body = await request.json().catch(() => ({}));
    const apiKey = typeof body?.apiKey === 'string' ? body.apiKey.trim() : '';
    if (!apiKey) return NextResponse.json({ error: 'Pega la clave del negocio' }, { status: 400 });

    const [existente] = await db.select().from(whatsappConfig).where(eq(whatsappConfig.teamId, teamId)).limit(1);
    if (existente) {
      return NextResponse.json({ error: 'Este negocio ya tiene WhatsApp configurado' }, { status: 409 });
    }

    let estado;
    try {
      // Vale como validación y como enlace en un solo viaje: si la clave no es
      // de un negocio vivo, esto es 401.
      estado = await generarConnectUrl(apiKey);
    } catch (err) {
      if (err instanceof WhatsAppApiError) {
        return NextResponse.json(
          { error: err.status === 401 ? 'Esa clave no la reconoce crm-escolar.' : err.message },
          { status: err.status === 401 ? 400 : err.status },
        );
      }
      throw err;
    }

    await crearWhatsAppConfig(teamId, negocioIdDelLink(estado.connectUrl) ?? 'desconocido', apiKey);
    // El número puede venir vacío aunque la cuenta esté conectada; se guarda
    // tal cual en vez de inventarlo, y la pantalla enseña «Conectado» a secas.
    await actualizarEstadoConexion(teamId, estado.whatsappConnected, estado.displayPhoneNumber || null);

    const appUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/+$/, '');
    try {
      const webhook = await registrarWebhook(apiKey, `${appUrl}/api/whatsapp/webhook/${teamId}`);
      await guardarWebhookSecret(teamId, webhook.secret);
    } catch (err) {
      // Igual que al crear: el canal ya sirve para MANDAR sin webhook. Lo que
      // se pierde es recibir las respuestas del tutor. En local falla siempre,
      // porque la URL apunta a una dirección que crm no puede alcanzar.
      console.error('[POST /api/whatsapp/enlazar] registrarWebhook', err);
    }

    logAudit({ teamId, userId: user.id, actor: user.email, action: 'WHATSAPP_CONECTAR', ip: getIp(request) });

    return NextResponse.json({
      ok: true,
      conectado: estado.whatsappConnected,
      numeroWhatsapp: estado.displayPhoneNumber || null,
      // Solo hace falta si la cuenta todavía no tiene número confirmado en Meta.
      connectUrl: estado.whatsappConnected ? null : estado.connectUrl,
    });
  } catch (err) {
    console.error('[POST /api/whatsapp/enlazar]', err);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}
