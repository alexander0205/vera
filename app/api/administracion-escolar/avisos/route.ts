import { NextRequest, NextResponse } from 'next/server';
import { requireModuleAndPermission } from '@/lib/auth/api-guard';
import { resumenDeAvisos } from '@/lib/administracion-escolar/panel-avisos';
import { motivoDeshabilitado as motivoSms } from '@/lib/sms/config';
import { getWhatsAppConfig } from '@/lib/whatsapp/config';

/**
 * El estado de los recordatorios del colegio: qué sale hoy, qué salió y a
 * quién no le va a llegar.
 *
 * Existe aparte del cron aunque calcule lo mismo: el del cron va con
 * `CRON_SECRET`, recorre TODOS los colegios y lo llama la plataforma. Este va
 * con el permiso del usuario y solo enseña el colegio en el que está.
 *
 * Nunca manda nada. Es de lectura, incluso cuando el envío real está encendido.
 */
export async function GET(_req: NextRequest) {
  const auth = await requireModuleAndPermission('escolar', 'administracion-escolar:ver');
  if (!auth.ok) return auth.response;
  const { teamId } = auth;

  // La fecha del colegio, no la del servidor: en UTC, a partir de las 8 de la
  // noche de RD ya es "mañana" y el panel enseñaría el plan del día siguiente.
  const hoy = new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const [resumen, sms, wa] = await Promise.all([
    resumenDeAvisos(teamId, hoy),
    motivoSms(teamId),
    getWhatsAppConfig(teamId),
  ]);

  return NextResponse.json({
    ...resumen,
    // Por qué un canal no puede mandar aunque esté encendido. Sin esto, el
    // colegio ve el interruptor en verde y no entiende por qué no sale nada.
    // El correo no aparece: sale por la cuenta de la plataforma y no hay nada
    // que el colegio pueda enlazar ni romper.
    credenciales: {
      sms: sms === null ? null : 'sin-credenciales',
      whatsapp: !wa ? 'sin-enlazar' : wa.conectado ? null : 'sin-conectar',
    },
  });
}
