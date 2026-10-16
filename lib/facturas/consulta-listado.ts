/**
 * Las condiciones SQL del listado «Facturas de venta», a partir del filtro.
 *
 * Las comparten la tabla (`/api/facturas`) y los archivos
 * (`/api/facturas/export`), para que un CSV/Excel/PDF traiga exactamente las
 * facturas que la tabla enseña con el mismo filtro.
 */
import { eq, gte, lte, ilike, or, sql, type SQL } from 'drizzle-orm';
import { ecfDocuments } from '@/lib/db/schema';
import type { FiltroFacturas } from './filtro-listado';

export function condicionesListadoFacturas(teamId: number, f: FiltroFacturas): SQL[] {
  const c: SQL[] = [
    eq(ecfDocuments.teamId, teamId),
    // Las Notas de Crédito (34) y Débito (33) tienen su propia pantalla — no se listan aquí.
    sql`${ecfDocuments.tipoEcf} NOT IN ('33', '34')`,
  ];
  if (f.q) {
    c.push(or(
      ilike(ecfDocuments.encf, `%${f.q}%`),
      ilike(ecfDocuments.codigo, `%${f.q}%`),
      ilike(ecfDocuments.razonSocialComprador, `%${f.q}%`),
    )!);
  }
  if (f.estado) c.push(eq(ecfDocuments.estado, f.estado));
  if (f.desde) c.push(gte(ecfDocuments.createdAt, new Date(f.desde)));
  if (f.hasta) c.push(lte(ecfDocuments.createdAt, new Date(f.hasta + 'T23:59:59')));
  // Filtro por clasificación de maestro (Plan A): facturas etiquetadas con
  // estos valores. Varios valores = AND (cada uno debe estar presente).
  for (const vid of f.maestroValorIds ?? []) {
    c.push(sql`EXISTS (
      SELECT 1 FROM factura_maestro_valores fmv
      WHERE fmv.ecf_document_id = ecf_documents.id
        AND fmv.valor_id = ${vid}
    )`);
  }
  // NCA-22: solo facturas con NCs/débitos referenciándolas
  if (f.conNcs) {
    c.push(sql`EXISTS (
      SELECT 1 FROM ecf_documents AS nc
      WHERE nc.team_id = ${teamId}
        AND nc.ncf_modificado = ecf_documents.encf
    )`);
  }
  return c;
}

// Subconsultas correlacionadas — con el nombre literal de la tabla: Drizzle
// interpola ${ecfDocuments.id} como parámetro, no como referencia de columna.

/** Cobrado: el ledger, o el pago inline de los documentos viejos. */
export const sqlPagado = sql<number>`GREATEST(
  coalesce((
    SELECT SUM(monto_centavos) FROM pagos_recibidos
    WHERE pagos_recibidos.ecf_document_id = ecf_documents.id
  ), 0),
  CASE WHEN ecf_documents.pago_recibido = 'true'
       THEN coalesce(ecf_documents.pago_valor_cts, 0) ELSE 0 END
)`;

/** Saldo de mora sin pagar de las ND de mora de la factura. */
export const sqlMoraPendiente = sql<number>`coalesce((
  SELECT SUM(nd.monto_total - coalesce((
    SELECT SUM(monto_centavos) FROM pagos_recibidos
    WHERE pagos_recibidos.ecf_document_id = nd.id
  ), 0))
  FROM ecf_documents AS nd
  WHERE nd.mora_origen_id = ecf_documents.id
    AND nd.estado != 'ANULADO'
    AND (nd.monto_total - coalesce((
      SELECT SUM(monto_centavos) FROM pagos_recibidos
      WHERE pagos_recibidos.ecf_document_id = nd.id
    ), 0)) > 0
), 0)`;

/** Saldo vivo de las notas de débito manuales (no de mora) de la factura. */
export const sqlNdPendiente = sql<number>`coalesce((
  SELECT SUM(GREATEST(0, nd.monto_total - coalesce((
    SELECT SUM(monto_centavos) FROM pagos_recibidos
    WHERE pagos_recibidos.ecf_document_id = nd.id
  ), 0)))
  FROM ecf_documents AS nd
  WHERE nd.origen_documento_id = ecf_documents.id
    AND nd.tipo_ecf = '33'
    AND nd.mora_origen_id IS NULL
    AND nd.estado != 'ANULADO'
), 0)`;
