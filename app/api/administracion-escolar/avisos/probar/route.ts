import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { teams } from '@/lib/db/schema';
import { requireModuleAndPermission } from '@/lib/auth/api-guard';
import { rateLimitDb } from '@/lib/rate-limit';
import { logAudit, getIp } from '@/lib/audit';
import { aGsm7 } from '@/lib/sms/mensaje';
import { enviarSms } from '@/lib/sms/enviar';
import { enviarWhatsApp } from '@/lib/whatsapp/enviar';
import { enviarAvisoCobroEmail } from '@/lib/email/escolar-avisos';
import type { Canal } from '@/lib/administracion-escolar/ciclo-cobro';

/**
 * Un mensaje de prueba por el canal que se elija, al destino que se escriba.
 *
 * Existe porque hasta ahora la única forma de saber si el correo, el WhatsApp o
 * el SMS de verdad salen era esperar al cron de la mañana y mirar si a alguna
 * familia le llegó algo. Cuando no llegaba nada no se distinguía entre «el
 * canal está mal enlazado», «al responsable le falta el celular» y «hoy no
 * tocaba ningún aviso» — tres problemas que se arreglan en tres sitios
 * distintos. Esto prueba solo el primero, que es el único que no se ve.
 *
 * NO toca cargos ni la tabla de idempotencia: no marca nada como avisado, así
 * que probar no le quita a nadie el recordatorio que le tocaba. Y el destino lo
 * escribe quien prueba —no sale de la ficha de ningún alumno— para que probar
 * no signifique escribirle a una familia.
 *
 * El error se devuelve tal cual viene del proveedor. Es lo único que sirve:
 * «no se pudo enviar» no distingue un número mal escrito de una cuenta sin
 * enlazar, y son las dos cosas que esta pantalla tiene que ayudar a arreglar.
 */

const CANALES: Canal[] = ['correo', 'whatsapp', 'sms'];

export async function POST(req: NextRequest) {
  const auth = await requireModuleAndPermission('escolar', 'administracion-escolar:configurar');
  if (!auth.ok) return auth.response;
  const { teamId, user } = auth;

  const body = await req.json().catch(() => ({}));
  const canal = body?.canal as Canal;
  const destino = typeof body?.destino === 'string' ? body.destino.trim() : '';

  if (!CANALES.includes(canal)) {
    return NextResponse.json({ error: 'Canal no válido' }, { status: 400 });
  }
  if (!destino) {
    return NextResponse.json(
      { error: canal === 'correo' ? 'Escribe un correo' : 'Escribe un número' },
      { status: 400 },
    );
  }

  // Diez por hora. El SMS se factura por mensaje aunque el número no exista, y
  // un botón de probar es exactamente la clase de cosa que alguien aprieta
  // veinte veces seguidas cuando no le llega.
  const rl = await rateLimitDb(`escolar_avisos_probar:${teamId}`, 10, 60 * 60_000);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Demasiadas pruebas seguidas. Espera un rato antes de volver a probar.' },
      { status: 429 },
    );
  }

  const [team] = await db.select({ name: teams.name }).from(teams).where(eq(teams.id, teamId)).limit(1);
  const colegio = team?.name ?? 'Tu colegio';

  // Se dice que es una prueba dentro del propio mensaje: si el número está mal
  // escrito, esto le llega a un desconocido y no puede parecer un cobro.
  const texto = `Prueba de envío de ${colegio}. Si estás leyendo esto, los recordatorios de cobro salen bien por este canal. No es una factura ni hay que pagar nada.`;

  try {
    let detalle: Record<string, unknown> = {};

    if (canal === 'correo') {
      await enviarAvisoCobroEmail({
        email: destino, colegio, asunto: 'Prueba de envío', texto,
      });
    } else if (canal === 'whatsapp') {
      const res = await enviarWhatsApp(teamId, destino, texto);
      detalle = { messageId: res.messageId };
    } else {
      // Mismo trato que en el envío real: sin acentos, porque una sola `í`
      // parte el SMS en tres. Si la prueba fuera con acentos, el mensaje de
      // verdad se cobraría distinto que el probado.
      const res = await enviarSms(teamId, destino, aGsm7(texto));
      detalle = { messageId: res.messageId, telefono: res.telefono, partes: res.partes, codificacion: res.codificacion };
    }

    logAudit({
      teamId, userId: user.id, actor: user.email,
      action: 'ESCOLAR_AVISO_PRUEBA', ip: getIp(req),
      // El destino se guarda: es un envío hacia afuera, y quién probó a qué
      // número es justo lo que se pregunta después.
      meta: { canal, destino },
    });

    return NextResponse.json({ ok: true, canal, destino, ...detalle });
  } catch (err) {
    const e = err as { name?: string; message?: string; codigo?: string };
    console.error('[POST /api/administracion-escolar/avisos/probar]', { canal, error: e.name, message: e.message });
    return NextResponse.json(
      {
        error: e.message ?? 'No se pudo enviar',
        // El nombre de la excepción distingue «el número no vale» de «la cuenta
        // no está enlazada», y la pantalla dice qué hacer según cuál sea.
        tipo: e.name ?? 'Error',
        codigo: e.codigo ?? null,
      },
      { status: 502 },
    );
  }
}
