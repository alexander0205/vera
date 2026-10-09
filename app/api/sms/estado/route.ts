import { NextResponse } from 'next/server';
import { getUser, getTeamIdForUser } from '@/lib/db/queries';
import { motivoDeshabilitado } from '@/lib/sms/config';

/**
 * Si este colegio puede mandar SMS.
 *
 * La pantalla de conceptos ofrece el canal solo si esto dice que sí: un
 * interruptor que se deja marcar y luego no manda nada es peor que no tenerlo.
 *
 * Devuelve `motivo` y no solo un booleano para que la pantalla pueda explicar
 * el "no": hoy la única razón es `sin-credenciales` —faltan las llaves de AWS
 * en el entorno, que es cosa nuestra y no del colegio— pero el campo deja sitio
 * para las que vengan sin cambiar el contrato.
 */
export async function GET() {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

  const teamId = await getTeamIdForUser();
  if (!teamId) return NextResponse.json({ error: 'Sin empresa' }, { status: 403 });

  const motivo = await motivoDeshabilitado(teamId);
  return NextResponse.json({ habilitado: motivo === null, motivo });
}
