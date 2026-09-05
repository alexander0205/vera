import { NextRequest, NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { adminEscolarPeriodos } from '@/lib/db/schema';
import { requireModuleAndPermission } from '@/lib/auth/api-guard';
import { devengarPeriodo, finDeMes } from '@/lib/administracion-escolar/devengar';

/**
 * Crea los cargos de las cuotas que ya entraron en vigor.
 *
 * Lo llama el botón "Generar cargos del mes" y, una vez al mes, el cron. Es la
 * pieza que va aterrizando el calendario: al matricular solo nace lo exigible
 * ese mes, y esto añade cada mensualidad cuando le llega el turno.
 *
 * Correrlo dos veces no cobra dos veces — el índice único
 * `(matricula_id, cuota_id)` lo impide y la respuesta dirá 0 creados.
 */
export async function POST(req: NextRequest) {
  const auth = await requireModuleAndPermission('escolar', 'administracion-escolar:gestionar');
  if (!auth.ok) return auth.response;
  const { teamId } = auth;

  const cuerpo = await req.json().catch(() => ({}));
  const periodoPedido = Number(cuerpo?.periodoId) || null;

  // Sin período explícito se usa el activo: es el único que puede estar
  // generando deuda, y es lo que quiere el cron.
  const [periodo] = await db
    .select({ id: adminEscolarPeriodos.id, nombre: adminEscolarPeriodos.nombre })
    .from(adminEscolarPeriodos)
    .where(periodoPedido
      ? and(eq(adminEscolarPeriodos.id, periodoPedido), eq(adminEscolarPeriodos.teamId, teamId))
      : and(eq(adminEscolarPeriodos.teamId, teamId), eq(adminEscolarPeriodos.activo, true)))
    .limit(1);

  if (!periodo) {
    return NextResponse.json({ error: 'No hay un año escolar activo' }, { status: 404 });
  }

  // Por defecto hasta HOY: un cargo nace el día de su emisión, no antes. Ver
  // el comentario largo en el cron de devengo. Si quien llama manda `hasta`
  // explícito se respeta —la pantalla de cierre de año necesita llegar al
  // final del período—, y ahí sí se completa el mes.
  const hasta = cuerpo?.hasta ? finDeMes(cuerpo.hasta) : new Date().toISOString().slice(0, 10);
  // El cron no manda la bandera; la pantalla de cierre de año sí.
  const incluirFinalizadas = cuerpo?.incluirFinalizadas === true;
  const resultado = await devengarPeriodo(teamId, periodo.id, hasta, incluirFinalizadas);

  return NextResponse.json({ periodo: periodo.nombre, hasta, incluirFinalizadas, ...resultado });
}
