import { NextRequest, NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { adminEscolarPeriodos } from '@/lib/db/schema';
import { devengarPeriodo, finDeMes } from '@/lib/administracion-escolar/devengar';

/**
 * Devengo mensual de la deuda escolar.
 *
 * Los cargos no nacen todos el día de la matrícula: al matricular solo se crea
 * lo exigible ese mes, y esto añade cada mensualidad cuando le llega el turno.
 * Sin este cron el padre solo debería la inscripción para siempre.
 *
 * Corre a diario aunque el devengo sea mensual, porque el día 1 puede fallar
 * (despliegue, caída, cuota de la plataforma) y un colegio no puede quedarse un
 * mes entero sin facturar por eso. Repetirlo no cobra de más: el índice único
 * `(matricula_id, cuota_id)` descarta lo que ya existe.
 *
 * Invocado por el cron de Vercel (vercel.json → crons[]).
 * Protegido con el mismo patrón que los demás: Authorization: Bearer ${CRON_SECRET}
 */
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  const hasta = finDeMes(new Date().toISOString().slice(0, 10));

  // Un año activo por colegio; el índice parcial de la migración 0105 lo
  // garantiza, así que esto es un período por team con módulo escolar en uso.
  const activos = await db
    .select({ teamId: adminEscolarPeriodos.teamId, id: adminEscolarPeriodos.id })
    .from(adminEscolarPeriodos)
    .where(eq(adminEscolarPeriodos.activo, true));

  const detalle: { teamId: number; cargosCreados: number; noGeneradas?: number; error?: string }[] = [];
  let creados = 0;

  for (const periodo of activos) {
    // Un colegio con la configuración a medias no puede dejar sin devengar a
    // los demás: se anota el fallo y se sigue.
    try {
      const r = await devengarPeriodo(periodo.teamId, periodo.id, hasta);
      creados += r.cargosCreados;
      // El diagnóstico (cuotas válidas que no salieron) viaja en la respuesta
      // para que un pendiente que no se facturó tenga un motivo visible (#5).
      detalle.push({
        teamId: periodo.teamId,
        cargosCreados: r.cargosCreados,
        ...(r.diagnostico.length ? { noGeneradas: r.diagnostico.length } : {}),
      });
    } catch (e: unknown) {
      detalle.push({
        teamId: periodo.teamId,
        cargosCreados: 0,
        error: e instanceof Error ? e.message : 'error desconocido',
      });
    }
  }

  return NextResponse.json({
    hasta,
    colegios: activos.length,
    cargosCreados: creados,
    detalle,
    timestamp: new Date().toISOString(),
  });
}
