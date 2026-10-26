import 'server-only';
import { db } from '@/lib/db/drizzle';
import { iaConsumo } from '@/lib/db/schema';
import { costoUsd, type Consumo } from './consumo';

/**
 * Guarda lo que gastó la IA en un turno, con su empresa y su chat. Nunca lanza
 * ni detiene la respuesta: si no se pudo anotar, queda en el log.
 */
export async function registrarConsumo(
  donde: { teamId: number | null; userId?: number | null; conversacionId?: number | null; mensajeId?: number | null },
  consumos: Consumo[],
): Promise<void> {
  const filas = consumos.filter((c) => (c.tokensEntrada || 0) + (c.tokensSalida || 0) > 0);
  if (filas.length === 0) return;
  try {
    await db.insert(iaConsumo).values(filas.map((c) => ({
      teamId: donde.teamId,
      userId: donde.userId ?? null,
      uso: c.uso,
      proveedor: c.proveedor,
      modelo: c.modelo.slice(0, 80),
      conversacionId: donde.conversacionId ?? null,
      mensajeId: donde.mensajeId ?? null,
      tokensEntrada: Math.round(c.tokensEntrada || 0),
      tokensSalida: Math.round(c.tokensSalida || 0),
      tokensCache: Math.round(c.tokensCache || 0),
      tokensCacheEscritura: Math.round(c.tokensCacheEscritura || 0),
      nivel: c.nivel ?? null,
      costoUsd: costoUsd(c).toFixed(8),
    })));
  } catch (err) {
    console.error('[ia] no se pudo anotar el consumo', err instanceof Error ? err.message : err);
  }
}
