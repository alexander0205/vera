/**
 * La mora de una familia, para poder enseñársela y cobrársela.
 *
 * La mora no es un cargo escolar: es una Nota de Débito tipo 33 que cuelga de
 * la factura que se venció (`mora_origen_id`). Esa decisión es correcta —una ND
 * es una ND, se anula sin tocar la factura original— pero tenía una
 * consecuencia que nadie había mirado: el enlace de pago del padre se arma
 * desde `admin_escolar_cargos`, y la mora no tiene cargo.
 *
 * Resultado en producción: 128 notas de mora, CERO con cargo detrás, y
 * RD$215,321 que el padre no podía ver ni pagar aunque quisiera. Una familia
 * con RD$137,020 de colegiatura y RD$10,961 de mora abría su enlace, veía los
 * RD$137,020, transfería eso, y la mora seguía ahí.
 *
 * Esto no cambia el modelo: la mora sigue siendo su propio documento con su
 * propio saldo. Solo la hace visible y cobrable desde donde el padre paga.
 */

import 'server-only';
import { and, eq, isNotNull, notInArray, or, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { ecfDocuments } from '@/lib/db/schema';

export interface MoraPendiente {
  /** El id de la NOTA DE DÉBITO. Es contra esto que se registra el cobro. */
  facturaId: number;
  codigo: string | null;
  /** La factura que se venció y la causó. */
  origenId: number;
  origenCodigo: string | null;
  /** Fecha desde la que se cobró ese período de mora (`mora_periodo`). */
  periodo: string | null;
  /** Saldo vivo en centavos: total menos cobrado menos notas de crédito. */
  montoCentavos: number;
}

/**
 * Saldo real de un documento: total − cobrado − notas de crédito aplicadas.
 *
 * `ecf_documents` no guarda el saldo, así que se calcula. Es la MISMA
 * expresión que usa `planDeAplicacion` para repartir un comprobante: si las dos
 * divergieran, la página le pediría al padre un importe y la aprobación
 * repartiría otro.
 */
const saldoSql = sql<number>`(
  ${ecfDocuments.montoTotal}
  - COALESCE((SELECT SUM(monto_centavos) FROM pagos_recibidos
              WHERE pagos_recibidos.ecf_document_id = ecf_documents.id), 0)
  - COALESCE((SELECT SUM(nc.monto_total) FROM ecf_documents nc
              WHERE nc.team_id = ecf_documents.team_id
                AND nc.tipo_ecf = '34'
                AND nc.credito_generado_cents IS NULL
                AND nc.estado NOT IN ('ANULADO', 'RECHAZADO')
                AND nc.codigo_modificacion IS DISTINCT FROM 2
                AND (nc.origen_documento_id = ecf_documents.id
                     OR (ecf_documents.encf LIKE 'E%' AND nc.ncf_modificado = ecf_documents.encf))
             ), 0)
)::int`;

/**
 * Las notas de mora con saldo de un responsable de pago.
 *
 * `scopeFacturaId` acota igual que el `?f=` del enlace, y cubre los dos casos
 * de una sola vez: la mora DE esa factura (`mora_origen_id = f`) y la propia
 * nota de mora, por si el enlace apunta directamente a ella (`id = f`).
 */
export async function morasPendientesDeResponsable(
  teamId: number,
  clientId: number,
  scopeFacturaId?: number | null,
): Promise<MoraPendiente[]> {
  const origen = sql`origen`;

  const filas = await db
    .select({
      facturaId: ecfDocuments.id,
      codigo: ecfDocuments.codigo,
      origenId: ecfDocuments.moraOrigenId,
      periodo: ecfDocuments.moraPeriodo,
      montoCentavos: saldoSql,
      origenCodigo: sql<string | null>`${origen}.codigo`,
    })
    .from(ecfDocuments)
    .leftJoin(
      sql`${ecfDocuments} AS origen`,
      sql`${origen}.id = ${ecfDocuments.moraOrigenId}`,
    )
    .where(and(
      eq(ecfDocuments.teamId, teamId),
      eq(ecfDocuments.clientId, clientId),
      // Lo que la convierte en mora, y de paso lo que impide que una factura
      // normal se cuele en esta lista.
      isNotNull(ecfDocuments.moraOrigenId),
      notInArray(ecfDocuments.estado, ['ANULADO', 'RECHAZADO']),
      notInArray(ecfDocuments.estadoPago, ['ANULADA', 'GRATUITA', 'USO']),
      scopeFacturaId
        ? or(
            eq(ecfDocuments.moraOrigenId, scopeFacturaId),
            eq(ecfDocuments.id, scopeFacturaId),
          )
        : undefined,
    ))
    .orderBy(ecfDocuments.moraPeriodo, ecfDocuments.id);

  return filas
    // El saldo se calcula, no se filtra en SQL, porque es una expresión y no
    // una columna: se descarta acá lo ya cobrado.
    .filter((f) => f.montoCentavos > 0)
    .map((f) => ({
      facturaId: f.facturaId,
      codigo: f.codigo,
      origenId: f.origenId!,
      origenCodigo: f.origenCodigo ?? null,
      periodo: f.periodo ? String(f.periodo) : null,
      montoCentavos: f.montoCentavos,
    }));
}
