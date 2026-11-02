/**
 * Las tareas por revisar que se quedan esperando (pedido del 29-10-2026):
 *
 *  1. Las que Soporte dejó «en revisión» con la plantilla y nadie contestó en
 *     24 horas se cierran solas, con su mensaje y su aviso.
 *  2. Cualquier tarea pendiente con 24 horas sin movimiento manda un correo
 *     URGENTE a quien le toca contestar: al colegio si lo último lo dijimos
 *     nosotros, a Soporte si lo dijeron ellos. Uno por cada parada.
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
