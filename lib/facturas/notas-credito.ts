/**
 * lib/facturas/notas-credito.ts — Crédito aplicado por Notas de Crédito (tipo 34).
 *
 * Una NC reduce el saldo cobrable de su factura padre (devoluciones, descuentos,
 * anulaciones). Cuenta toda NC no anulada / no rechazada vinculada al padre por:
 *   - origen_documento_id = padre.id  (vínculo por id — robusto, sobrevive a
 *     que el padre BOR- sea promovido a e-CF real), o
 *   - ncf_modificado = padre.encf     (solo cuando el padre tiene e-NCF real;
 *     cubre NC creadas a mano tipeando el e-NCF)
 *
 * El estado BORRADOR cuenta: la NC reduce el saldo desde que se crea, esté o
 * no emitida a la DGII (la emisión es una decisión fiscal, no de cobranza).
 */
import { db } from '@/lib/db/drizzle';
import { sql } from 'drizzle-orm';

/**
 * Subquery SQL correlacionada: total (centavos) de NC aplicadas al
 * ecf_documents de la consulta exterior. Usar SOLO dentro de SELECTs cuyo
 * FROM principal sea ecf_documents (referencia la tabla por nombre literal,
 * mismo patrón que `pagado`/`moraSaldo` en getCuentasPorCobrar).
 */
export const NC_APLICADO_SUBQUERY = `coalesce((
  SELECT SUM(nc.monto_total) FROM ecf_documents nc
  WHERE nc.team_id = ecf_documents.team_id
    AND nc.tipo_ecf = '34'
    AND nc.estado NOT IN ('ANULADO', 'RECHAZADO')
    AND (
      nc.origen_documento_id = ecf_documents.id
      OR (ecf_documents.encf LIKE 'E%' AND nc.ncf_modificado = ecf_documents.encf)
    )
), 0)`;

/** Total en centavos de NC aplicadas a un documento. */
export async function getNcAplicadoCts(
  teamId: number,
  docId: number,
  encf?: string | null,
): Promise<number> {
  const encfReal = encf && /^E\d/.test(encf) ? encf : null;
  const rows = await db.execute<{ total: string }>(sql`
    SELECT coalesce(SUM(monto_total), 0)::text AS total
    FROM ecf_documents
    WHERE team_id = ${teamId}
      AND tipo_ecf = '34'
      AND estado NOT IN ('ANULADO', 'RECHAZADO')
      AND (
        origen_documento_id = ${docId}
        OR (${encfReal}::text IS NOT NULL AND ncf_modificado = ${encfReal})
      )
  `);
  return Number(rows[0]?.total ?? 0);
}
