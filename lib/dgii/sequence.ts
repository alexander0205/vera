/**
 * Manejo de secuencias de e-NCF usando Drizzle ORM
 * Las secuencias se obtienen de la DGII vía la Oficina Virtual (OFV)
 * y se almacenan en la BD
 */

import { db } from '@/lib/db/drizzle';
import { sequences } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { sql } from 'drizzle-orm';

/**
 * Obtiene el próximo e-NCF disponible para un team y tipo
 * Incrementa la secuencia atómicamente usando UPDATE ... RETURNING
 */
export async function getNextEncf(
  teamId: number,
  tipoEcf: string
): Promise<{ encf: string; secuencia: bigint }> {
  // Verificar que existe y no ha vencido
  const [seq] = await db
    .select()
    .from(sequences)
    .where(and(eq(sequences.teamId, teamId), eq(sequences.tipoEcf, tipoEcf)))
    .limit(1);

  if (!seq) {
    throw new Error(
      `No hay secuencias configuradas para el tipo ${tipoEcf}. ` +
        `Solicita las secuencias en la Oficina Virtual de la DGII.`
    );
  }

  if (seq.secuenciaActual > seq.secuenciaHasta) {
    throw new Error(
      `Las secuencias para el tipo ${tipoEcf} se han agotado. ` +
        `Solicita nuevas secuencias en la Oficina Virtual de la DGII.`
    );
  }

  // Algunos tipos (32, 34, sin-ncf) no requieren fecha de vencimiento.
  // Solo verificamos si la secuencia tiene fecha definida.
  if (seq.fechaVencimiento && new Date() > seq.fechaVencimiento) {
    throw new Error(
      `Las secuencias para el tipo ${tipoEcf} han vencido. ` +
        `Solicita nuevas secuencias en la Oficina Virtual de la DGII.`
    );
  }

  const secuencia = seq.secuenciaActual;

  // Incrementar atómicamente
  await db
    .update(sequences)
    .set({ secuenciaActual: sql`${sequences.secuenciaActual} + 1` })
    .where(and(eq(sequences.teamId, teamId), eq(sequences.tipoEcf, tipoEcf)));

  // Formato: E + tipo (2 dígitos) + secuencia (10 dígitos con ceros a la izquierda)
  const encf = `E${tipoEcf}${secuencia.toString().padStart(10, '0')}`;

  return { encf, secuencia };
}

/**
 * Registra las secuencias obtenidas de la DGII
 */
export async function registrarSecuencias(
  teamId: number,
  tipoEcf: string,
  desde: bigint,
  hasta: bigint,
  fechaVencimiento: Date
) {
  const existing = await db
    .select()
    .from(sequences)
    .where(and(eq(sequences.teamId, teamId), eq(sequences.tipoEcf, tipoEcf)))
    .limit(1);

  if (existing.length > 0) {
    return db
      .update(sequences)
      .set({
        secuenciaActual: desde,
        secuenciaHasta: hasta,
        fechaVencimiento,
        updatedAt: new Date(),
      })
      .where(and(eq(sequences.teamId, teamId), eq(sequences.tipoEcf, tipoEcf)));
  }

  return db.insert(sequences).values({
    teamId,
    tipoEcf,
    secuenciaActual: desde,
    secuenciaHasta: hasta,
    fechaVencimiento,
  });
}
