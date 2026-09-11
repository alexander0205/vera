import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { nominaProgramacion } from '@/lib/db/schema';
import { corridasDelDia } from '@/lib/nomina/programacion';
import { generarCorrida } from '@/lib/nomina/generar-corrida';
import { hoyRD } from '@/lib/utils/format';

/**
 * Cron diario de nómina automática. Por cada empresa con la programación
 * activa, mira si HOY (fecha RD) es un día de pago y, si lo es, crea la corrida
 * de esa frecuencia EN BORRADOR. Idempotente: el índice único (team, periodo,
 * tipo) de nomina_corridas impide crear dos veces la misma, así que reintentar
 * el cron el mismo día no duplica nada.
 *
 * Protegido con CRON_SECRET, igual que los demás crons. Un fallo en una empresa
 * no aborta el resto: se anota y se sigue.
 */
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  const hoy = hoyRD();

  const programaciones = await db
    .select()
    .from(nominaProgramacion)
    .where(eq(nominaProgramacion.activa, true));

  const resultados: Array<{
    teamId: number; tipo: string; periodo: string; estado: string; detalle?: string;
  }> = [];

  for (const cfg of programaciones) {
    const debidas = corridasDelDia(cfg, hoy);
    for (const c of debidas) {
      try {
        const r = await generarCorrida({
          teamId: cfg.teamId,
          periodo: c.periodo,
          tipo: c.tipo,
          descripcion: c.descripcion,
          fechaPago: c.fechaPago, // fecha REAL de pago (hoy + anticipación)
          userId: null, // creada por el sistema
          frecuencias: [c.frecuenciaEmpleado],
        });
        resultados.push(
          r.creada
            ? { teamId: cfg.teamId, tipo: c.tipo, periodo: c.periodo, estado: 'creada', detalle: `${r.lineas} empleado(s)` }
            : { teamId: cfg.teamId, tipo: c.tipo, periodo: c.periodo, estado: 'omitida', detalle: r.motivo },
        );
      } catch (e) {
        resultados.push({ teamId: cfg.teamId, tipo: c.tipo, periodo: c.periodo, estado: 'error', detalle: String(e) });
      }
    }
  }

  const creadas = resultados.filter((r) => r.estado === 'creada').length;
  return NextResponse.json({
    fecha: hoy,
    empresasRevisadas: programaciones.length,
    corridasCreadas: creadas,
    resultados,
    timestamp: new Date().toISOString(),
  });
}
