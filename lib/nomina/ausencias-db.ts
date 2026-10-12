import { and, eq, gte, inArray, lte } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { nominaAusencias } from '@/lib/db/schema';
import { descuentaDias, esTipoAusencia, type RangoAusente } from '@/lib/nomina/ausencias';

/** Las ausencias que se descuentan y tocan el período, por empleado. */
export async function ausenciasParaCorrida(
  teamId: number,
  empleadoIds: number[],
  inicio: string,
  fin: string,
): Promise<Map<number, RangoAusente[]>> {
  const mapa = new Map<number, RangoAusente[]>();
  if (empleadoIds.length === 0) return mapa;
  const filas = await db
    .select({ empleadoId: nominaAusencias.empleadoId, tipo: nominaAusencias.tipo, desde: nominaAusencias.desde, hasta: nominaAusencias.hasta })
    .from(nominaAusencias)
    .where(and(
      eq(nominaAusencias.teamId, teamId),
      eq(nominaAusencias.activo, true),
      inArray(nominaAusencias.empleadoId, empleadoIds),
      lte(nominaAusencias.desde, fin),
      gte(nominaAusencias.hasta, inicio),
    ));
  for (const f of filas) {
    if (!esTipoAusencia(f.tipo) || !descuentaDias(f.tipo)) continue;
    const lista = mapa.get(f.empleadoId) ?? [];
    lista.push({ inicio: f.desde, fin: f.hasta });
    mapa.set(f.empleadoId, lista);
  }
  return mapa;
}
