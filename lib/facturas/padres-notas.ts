/**
 * lib/facturas/padres-notas.ts — Resuelve si la factura padre de cada nota
 * (tipo 33/34) ya tiene e-CF emitido a la DGII.
 *
 * Una nota BORRADOR cuyo padre ya está emitido "puede" enviarse a la DGII
 * (decisión del usuario, nunca obligatoria) → los listados muestran el badge
 * "Pendiente DGII" para hacerlo visible.
 */
import { db } from '@/lib/db/drizzle';
import { ecfDocuments } from '@/lib/db/schema';
import { and, eq, inArray, or, sql } from 'drizzle-orm';

const ESTADOS_EMITIDO = ['ACEPTADO', 'ACEPTADO_CONDICIONAL', 'EN_PROCESO'];

export async function resolverPadresEmitidos(
  teamId: number,
  notas: Array<{
    id: number;
    origenDocumentoId?: number | null;
    ncfModificado?: string | null;
  }>,
): Promise<Map<number, boolean>> {
  const result = new Map<number, boolean>();
  if (notas.length === 0) return result;

  const padreIds = [...new Set(
    notas.map(n => n.origenDocumentoId).filter((v): v is number => v != null),
  )];
  const padreEncfs = [...new Set(
    notas.map(n => n.ncfModificado).filter((v): v is string => !!v && /^E\d/.test(v)),
  )];

  const padres = (padreIds.length || padreEncfs.length)
    ? await db
        .select({ id: ecfDocuments.id, encf: ecfDocuments.encf, estado: ecfDocuments.estado })
        .from(ecfDocuments)
        .where(and(
          eq(ecfDocuments.teamId, teamId),
          or(
            padreIds.length   ? inArray(ecfDocuments.id, padreIds)     : sql`false`,
            padreEncfs.length ? inArray(ecfDocuments.encf, padreEncfs) : sql`false`,
          ),
        ))
    : [];

  const porId   = new Map(padres.map(p => [p.id, p]));
  const porEncf = new Map(padres.map(p => [p.encf, p]));

  for (const n of notas) {
    const padre = (n.origenDocumentoId != null ? porId.get(n.origenDocumentoId) : undefined)
      ?? (n.ncfModificado ? porEncf.get(n.ncfModificado) : undefined);
    if (padre) {
      result.set(n.id, ESTADOS_EMITIDO.includes(padre.estado));
    } else {
      // Sin padre local: un ncfModificado con e-NCF real (E...) implica que la
      // factura original ya fue emitida (posiblemente fuera de emitedo).
      result.set(n.id, !!n.ncfModificado && /^E\d/.test(n.ncfModificado));
    }
  }
  return result;
}
