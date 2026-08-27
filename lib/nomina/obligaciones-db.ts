/**
 * Persistencia de las obligaciones de nómina (capa con BD; la aritmética vive
 * en `./obligaciones`). Al aprobar una corrida se crean sus obligaciones; cada
 * pago (empleado u obligación) refresca el estado de la corrida.
 */

import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { nominaCorridas, nominaLineas, nominaObligaciones } from '@/lib/db/schema';
import { obligacionesDeLineas } from '@/lib/nomina/obligaciones';

/**
 * Crea las obligaciones (TSS/DGII) de una corrida a partir de sus líneas.
 * Idempotente: el índice único (corrida, destino) evita duplicar si se reaprueba.
 */
export async function crearObligacionesCorrida(teamId: number, corridaId: number): Promise<void> {
  const lineas = await db
    .select({
      afpEmpleadoCents: nominaLineas.afpEmpleadoCents,
      sfsEmpleadoCents: nominaLineas.sfsEmpleadoCents,
      isrCents: nominaLineas.isrCents,
      afpPatronalCents: nominaLineas.afpPatronalCents,
      sfsPatronalCents: nominaLineas.sfsPatronalCents,
      srlPatronalCents: nominaLineas.srlPatronalCents,
      infotepPatronalCents: nominaLineas.infotepPatronalCents,
    })
    .from(nominaLineas)
    .where(eq(nominaLineas.corridaId, corridaId));

  const obligaciones = obligacionesDeLineas(lineas);
  if (obligaciones.length === 0) return;

  await db
    .insert(nominaObligaciones)
    .values(obligaciones.map((o) => ({
      teamId,
      corridaId,
      destino: o.destino,
      montoCents: o.montoCents,
      parteRetencionesCents: o.parteRetencionesCents,
      parteAportesCents: o.parteAportesCents,
    })))
    .onConflictDoNothing();
}

/**
 * Si ya no queda nada pendiente (todos los empleados pagados y todas las
 * obligaciones saldadas), la corrida pasa a 'pagada'. Solo avanza desde
 * 'aprobada'; nunca retrocede.
 */
export async function refrescarEstadoCorrida(teamId: number, corridaId: number): Promise<void> {
  const [corrida] = await db
    .select({ estado: nominaCorridas.estado })
    .from(nominaCorridas)
    .where(and(eq(nominaCorridas.id, corridaId), eq(nominaCorridas.teamId, teamId)))
    .limit(1);
  if (!corrida || corrida.estado !== 'aprobada') return;

  const lineasPend = await db
    .select({ id: nominaLineas.id })
    .from(nominaLineas)
    .where(and(eq(nominaLineas.corridaId, corridaId), eq(nominaLineas.pagada, false)))
    .limit(1);
  if (lineasPend.length > 0) return;

  const oblPend = await db
    .select({ id: nominaObligaciones.id })
    .from(nominaObligaciones)
    .where(and(eq(nominaObligaciones.corridaId, corridaId), eq(nominaObligaciones.pagada, false)))
    .limit(1);
  if (oblPend.length > 0) return;

  await db
    .update(nominaCorridas)
    .set({ estado: 'pagada', pagadaEn: new Date() })
    .where(eq(nominaCorridas.id, corridaId));
}
