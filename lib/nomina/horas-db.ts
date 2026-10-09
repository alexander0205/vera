import { and, eq, gte, lte, ne } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { nominaCorridas } from '@/lib/db/schema';
import { tiposDeFrecuencia, type FrecuenciaPago } from '@/lib/nomina/corrida';

export interface CorridaCerrada { tipo: string; fechaInicio: string; fechaFin: string }

/**
 * Corridas del team que ya salieron de borrador y tocan el rango. Una hora que
 * cae dentro de una de ellas ya no la paga ninguna corrida: la siguiente empieza
 * después, y la aprobada no se recalcula.
 */
export function corridasCerradas(teamId: number, desde: string, hasta: string): Promise<CorridaCerrada[]> {
  return db
    .select({ tipo: nominaCorridas.tipo, fechaInicio: nominaCorridas.fechaInicio, fechaFin: nominaCorridas.fechaFin })
    .from(nominaCorridas)
    .where(and(
      eq(nominaCorridas.teamId, teamId),
      ne(nominaCorridas.estado, 'borrador'),
      lte(nominaCorridas.fechaInicio, hasta),
      gte(nominaCorridas.fechaFin, desde),
    ));
}

/** Si la fecha ya la cubre una corrida cerrada de la frecuencia del empleado. */
export function enCorridaCerrada(corridas: CorridaCerrada[], frecuencia: string, fecha: string): boolean {
  const tipos = tiposDeFrecuencia(frecuencia as FrecuenciaPago);
  return corridas.some((c) => tipos.includes(c.tipo) && c.fechaInicio <= fecha && fecha <= c.fechaFin);
}
