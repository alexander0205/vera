import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { getUser, getTeamIdForUser } from '@/lib/db/queries';
import { db } from '@/lib/db/drizzle';
import { teams, whatsappConfig } from '@/lib/db/schema';
import { crearNegocio, registrarWebhook, WhatsAppApiError } from '@/lib/whatsapp/client';
import { crearWhatsAppConfig, guardarWebhookSecret } from '@/lib/whatsapp/config';
import { logAudit, getIp } from '@/lib/audit';
import { rateLimitDb } from '@/lib/rate-limit';

export async function POST(request: NextRequest) {
  try {
    const user = await getUser();
    if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

    const teamId = await getTeamIdForUser();
    if (!teamId) return NextResponse.json({ error: 'Sin empresa' }, { status: 403 });

    const rl = await rateLimitDb(`whatsapp_conectar:${teamId}`, 20, 60 * 60_000);
    if (!rl.allowed) {
      return NextResponse.json({ error: 'Demasiados intentos. Espera un momento.' }, { status: 429 });
    }

    const [existing] = await db.select().from(whatsappConfig).where(eq(whatsappConfig.teamId, teamId)).limit(1);
    if (existing) {
      return NextResponse.json({ error: 'Este negocio ya tiene WhatsApp configurado' }, { status: 409 });
    }

    const [team] = await db.select().from(teams).where(eq(teams.id, teamId)).limit(1);
    if (!team) return NextResponse.json({ error: 'Empresa no encontrada' }, { status: 404 });

    // La API de crm-escolar exige un email para crear el negocio (login del
    // dashboard que devuelve). Usamos el de facturación del team; si falta,
    // pedimos completarlo antes de conectar en vez de mandar uno inventado.
    const email = team.emailFacturacion || team.correoRepresentante;
    if (!email) {
      return NextResponse.json(
        { error: 'Completa un email de facturación en Configuración antes de conectar WhatsApp.' },
        { status: 422 },
      );
    }

    let negocio;
    try {
      negocio = await crearNegocio(team.name, email, team.posEscolarHabilitado ? 'colegio' : 'general');
    } catch (err) {
      if (err instanceof WhatsAppApiError) {
        return NextResponse.json({ error: err.message }, { status: err.status });
      }
      throw err;
    }

    await crearWhatsAppConfig(teamId, negocio.negocioId, negocio.apiKey);

    const appUrl = process.env.NEXT_PUBLIC_APP_URL!.replace(/\/+$/, '');
    try {
      const webhook = await registrarWebhook(negocio.apiKey, `${appUrl}/api/whatsapp/webhook/${teamId}`);
      await guardarWebhookSecret(teamId, webhook.secret);
    } catch (err) {
      // El negocio y la apiKey ya quedaron guardados — si esto falla, el
      // webhook se puede reintentar registrar después desde /api/whatsapp/estado.
      console.error('[POST /api/whatsapp/conectar] registrarWebhook', err);
    }

    logAudit({ teamId, userId: user.id, actor: user.email, action: 'WHATSAPP_CONECTAR', ip: getIp(request) });

    return NextResponse.json({ ok: true, connectUrl: negocio.connectUrl });
  } catch (err) {
    console.error('[POST /api/whatsapp/conectar]', err);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}
