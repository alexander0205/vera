/**
 * Las tareas por revisar que se quedan esperando (pedido del 29-10-2026):
 *
 *  1. Las que Soporte dejó «en revisión» con la plantilla y nadie contestó en
 *     24 horas se cierran solas, con su mensaje y su aviso.
 *  2. Cualquier tarea pendiente con 2 horas (HORAS_ALERTA) sin movimiento y
 *     sin pausa avisa URGENTE a quien le toca contestar (guardado en la tarea):
 *     a quien la tomó por ese lado o, si nadie, a todo ese equipo; por campana,
 *     push y correo, y por Slack si es el lado de Zero. Nunca WhatsApp. Uno
 *     por cada parada. Es el MISMO cron por hora, sin cambiar su horario.
 *
 * Cada hora de 07:05 a 19:05 hora dominicana (`11-23` UTC), como los demás
 * crons que despiertan a Neon: una tarea que vence de noche se cierra o avisa
 * en la primera pasada de la mañana. Protegido con `CRON_SECRET`.
 */
import { NextRequest, NextResponse } from 'next/server';
import { llamadaDeCronValida } from '@/lib/seguridad/cron';
import { avisarTareasSinRespuesta, cerrarRevisionesVencidas } from '@/lib/administracion-escolar/tareas';

export const maxDuration = 120;

export async function GET(req: NextRequest) {
  if (!llamadaDeCronValida(req.headers.get('authorization'))) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }
  const cerradas = await cerrarRevisionesVencidas();
  const urgentes = await avisarTareasSinRespuesta();
  console.info('[cron escolar-tareas]', { cerradas, urgentes });
  return NextResponse.json({ ok: true, cerradas, urgentes });
}
