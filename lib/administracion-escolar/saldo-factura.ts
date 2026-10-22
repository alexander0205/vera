/**
 * Lo que la familia debe de una factura, contado como lo cuenta Cuentas por
 * cobrar.
 *
 * Las fichas escolares calculaban el saldo por su cuenta —monto menos pagos— y
 * se separaban de Facturación en tres sitios:
 *   · una factura ANULADA seguía saliendo como deuda,
 *   · una HISTÓRICA marcada pagada, sin pagos registrados en el sistema,
 *     también,
 *   · y una nota de crédito al contacto se leía como una factura más que debía.
 * El resultado era que la secretaria veía una cifra en la ficha y otra en
 * `Facturación > Cuentas por cobrar`, y no había forma de saber cuál creer.
 *
 * La regla del capital es la de `getCuentasPorCobrar` (lib/db/queries.ts):
 *   saldo = max(0, monto − pagado − NC aplicada)
 * y solo si la factura sigue PENDIENTE/PARCIAL y no está anulada ni rechazada.
 * Si allí cambia, aquí también.
 *
 * La MORA va aparte (`moraFacturaSql`), nunca sumada al saldo de la factura.
 * Es la convención de las fichas de familia: las notas de débito por mora se
 * cuentan en su propio campo y no se llaman «facturas». Sumarla aquí también la
 * haría contar dos veces en cuanto las dos pantallas se miran juntas.
 */

import { sql, type SQL } from 'drizzle-orm';

/**
 * Solo documentos que son una venta al contacto.
 *
 * Fuera las ND de mora —van aparte, ver `moraFacturaSql`—, las notas de
 * crédito —restan, no se deben— y las compras/gastos (41/43/47), que son
 * dinero que sale.
 */
export function esVentaSql(alias: string): SQL {
  const x = sql.raw(alias);
  return sql`${x}.mora_origen_id IS NULL AND ${x}.tipo_ecf NOT IN ('34', '41', '43', '47')`;
}

const pagadoDe = (doc: SQL) => sql`COALESCE((
  SELECT SUM(p.monto_centavos) FROM pagos_recibidos p WHERE p.ecf_document_id = ${doc}.id
), 0)`;

/** El capital vivo de la factura `alias`, en centavos. Sin la mora. */
export function saldoFacturaSql(alias: string): SQL {
  const x = sql.raw(alias);
  return sql`(CASE WHEN ${x}.estado IN ('ANULADO', 'RECHAZADO') THEN 0
    WHEN ${x}.estado_pago IN ('PENDIENTE', 'PARCIAL') THEN GREATEST(0,
      ${x}.monto_total - ${pagadoDe(x)}
      - COALESCE((
          -- NC del modelo viejo: reducen la factura. Las nuevas dejan saldo a
          -- favor del cliente y no la tocan.
          SELECT SUM(nc.monto_total) FROM ecf_documents nc
           WHERE nc.team_id = ${x}.team_id
             AND nc.tipo_ecf = '34'
             AND nc.credito_generado_cents IS NULL
             AND nc.estado NOT IN ('ANULADO', 'RECHAZADO')
             AND nc.codigo_modificacion IS DISTINCT FROM 2
             AND (nc.origen_documento_id = ${x}.id
                  OR (${x}.encf LIKE 'E%' AND nc.ncf_modificado = ${x}.encf))
        ), 0))
    ELSE 0 END)::bigint`;
}

/**
 * Lo que queda por cobrar de la mora de la factura `alias`: sus notas de débito
 * (`mora_origen_id`), con GREATEST por nota como el motor de mora —una nota
 * sobrepagada no le resta saldo a las demás—.
 */
export function moraFacturaSql(alias: string): SQL {
  const x = sql.raw(alias);
  return sql`(CASE WHEN ${x}.estado IN ('ANULADO', 'RECHAZADO') THEN 0 ELSE COALESCE((
    SELECT SUM(GREATEST(0, nd.monto_total - ${pagadoDe(sql.raw('nd'))}))
      FROM ecf_documents nd
     WHERE nd.mora_origen_id = ${x}.id AND nd.estado <> 'ANULADO'
  ), 0) END)::bigint`;
}
