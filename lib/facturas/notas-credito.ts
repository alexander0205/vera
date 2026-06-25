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
    -- Solo NCs del MODELO VIEJO reducen el saldo de la factura. Las NCs nuevas
    -- (credito_generado_cents IS NOT NULL) generan saldo a favor del cliente y NO
    -- tocan la factura.
    AND nc.credito_generado_cents IS NULL
    AND nc.estado NOT IN ('ANULADO', 'RECHAZADO')
    -- Código 2 (Corrige texto) NO tiene efecto monetario → no reduce el saldo.
    -- Códigos 1 (Anula), 3 (Corrige monto), devolución/descuento y sin-código sí.
    AND nc.codigo_modificacion IS DISTINCT FROM 2
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
      -- Solo NCs del modelo viejo reducen la factura (ver NC_APLICADO_SUBQUERY).
      AND credito_generado_cents IS NULL
      AND estado NOT IN ('ANULADO', 'RECHAZADO')
      AND codigo_modificacion IS DISTINCT FROM 2
      AND (
        origen_documento_id = ${docId}
        OR (${encfReal}::text IS NOT NULL AND ncf_modificado = ${encfReal})
      )
  `);
  return Number(rows[0]?.total ?? 0);
}

/**
 * Saldo a favor (crédito) disponible de un cliente, en centavos.
 *   = Σ credito_generado_cents de sus NCs nuevas (no anuladas/rechazadas)
 *     − Σ pagos con método 'saldo_favor' o 'nota_credito' aplicados a sus facturas.
 * Incluye el sobrante de NCs usadas como voucher (NC > factura → resto queda aquí).
 * Nunca negativo.
 */
export async function getSaldoFavorCliente(teamId: number, clientId: number): Promise<number> {
  const rows = await db.execute<{ saldo: string }>(sql`
    SELECT (
      coalesce((
        SELECT SUM(credito_generado_cents) FROM ecf_documents
        WHERE team_id = ${teamId} AND client_id = ${clientId}
          AND tipo_ecf = '34' AND credito_generado_cents IS NOT NULL
          AND estado NOT IN ('ANULADO', 'RECHAZADO')
      ), 0)
      -
      coalesce((
        SELECT SUM(pr.monto_centavos) FROM pagos_recibidos pr
        JOIN ecf_documents f ON f.id = pr.ecf_document_id
        WHERE f.team_id = ${teamId} AND f.client_id = ${clientId}
          AND pr.metodo IN ('saldo_favor', 'nota_credito')
      ), 0)
    )::text AS saldo
  `);
  return Math.max(0, Number(rows[0]?.saldo ?? 0));
}

/**
 * Notas de Crédito de un cliente disponibles para usar como pago (voucher):
 * tienen crédito (>0), no anuladas/rechazadas, y NO se han usado todavía
 * (ningún pago las referencia). Cada NC se usa una sola vez.
 */
export async function getNotasCreditoDisponibles(
  teamId: number,
  clientId: number,
): Promise<{ id: number; codigo: string | null; encf: string | null; facturaCodigo: string | null; montoCents: number }[]> {
  // facturaCodigo = código de la factura de origen (por id), o el e-NCF que modifica
  // si la factura no está en el sistema. Permite buscar la NC por su código o por
  // el de la factura de donde salió.
  // Saldo restante = credito_generado − Σ pagos que ya consumieron esta NC.
  // Uso PARCIAL: la NC sigue disponible (por su restante) hasta agotarla.
  const rows = await db.execute<{ id: number; codigo: string | null; encf: string | null; factura_codigo: string | null; credito: string }>(sql`
    SELECT t.id, t.codigo, t.encf, t.factura_codigo, t.remaining::text AS credito
    FROM (
      SELECT nc.id, nc.codigo, nc.encf,
        coalesce(
          (SELECT p2.codigo FROM ecf_documents p2 WHERE p2.id = nc.origen_documento_id),
          nc.ncf_modificado
        ) AS factura_codigo,
        (nc.credito_generado_cents - coalesce(
          (SELECT SUM(pr.monto_centavos) FROM pagos_recibidos pr WHERE pr.nota_credito_id = nc.id), 0
        )) AS remaining
      FROM ecf_documents nc
      WHERE nc.team_id = ${teamId} AND nc.client_id = ${clientId}
        AND nc.tipo_ecf = '34'
        AND nc.credito_generado_cents IS NOT NULL AND nc.credito_generado_cents > 0
        AND nc.estado NOT IN ('ANULADO', 'RECHAZADO')
    ) t
    WHERE t.remaining > 0
    ORDER BY t.id DESC
  `);
  return (rows as unknown as { id: number; codigo: string | null; encf: string | null; factura_codigo: string | null; credito: string }[])
    .map(r => ({ id: Number(r.id), codigo: r.codigo, encf: r.encf, facturaCodigo: r.factura_codigo, montoCents: Number(r.credito) }));
}
