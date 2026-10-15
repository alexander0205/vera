/**
 * Las compras de un mes tal como van al Formato 606.
 *
 * Es la lectura que antes vivía dentro de `app/api/reportes/606/route.ts`; está
 * aquí para que el archivo de la DGII y el Excel fiscal del asistente salgan de
 * la MISMA lógica (qué comprobantes entran, cómo se parten servicios y bienes).
 *
 * Reúne dos fuentes del período:
 *   1. los comprobantes de proveedores registrados en Compras y Gastos
 *      (compras_locales, no anulados);
 *   2. los comprobantes que emite la propia empresa: compras a informales (41),
 *      gastos menores (43) y pagos al exterior (47), solo si ya se emitieron.
 */
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { analizarNcf, formaPago606, type CompraPara606 } from './fiscal';
import { TIPO606_CATEGORIA_GASTO_VIEJA } from './categorias';
import { retencionesDeJson } from './formato606';

const n = (v: unknown) => Number(v ?? 0);

export type Compra606Detallada = CompraPara606 & {
  /** Nombre del proveedor tal como está en Compras (o el RNC si no hay). */
  proveedor: string | null;
};

export async function cargarCompras606(teamId: number, inicio: string, fin: string): Promise<Compra606Detallada[]> {
  const [registradas, emitidas] = await Promise.all([
    db.execute(sql`
      SELECT proveedor_rnc, proveedor_nombre, referencia_encf, ncf_modificado, tipo_bienes_606,
             to_char(fecha, 'YYYY-MM-DD') AS fecha, to_char(fecha_pago, 'YYYY-MM-DD') AS fecha_pago,
             monto_total, itbis_cents, monto_servicios_cents, monto_bienes_cents, itbis_al_costo_cents,
             itbis_retenido_cents, isr_tipo_retencion, isr_retenido_cents, isc_cents, otros_impuestos_cents,
             propina_cents, forma_pago, metodo_pago
      FROM compras_locales
      WHERE team_id = ${teamId} AND estado = 'registrada' AND referencia_encf IS NOT NULL
        AND fecha BETWEEN ${inicio} AND ${fin}
      ORDER BY fecha, id
    `),
    db.execute(sql`
      SELECT encf, tipo_ecf, rnc_comprador, razon_social_comprador, ncf_modificado, categoria_gasto, retenciones,
             monto_total, total_itbis, tipo_pago, pago_metodo, pago_fecha,
             to_char(coalesce(fecha_gasto, (fecha_emision AT TIME ZONE 'America/Santo_Domingo')::date), 'YYYY-MM-DD') AS fecha
      FROM ecf_documents
      WHERE team_id = ${teamId} AND tipo_ecf IN ('41', '43', '47')
        AND estado IN ('ACEPTADO', 'ACEPTADO_CONDICIONAL', 'EN_PROCESO')
        AND coalesce(fecha_gasto, (fecha_emision AT TIME ZONE 'America/Santo_Domingo')::date) BETWEEN ${inicio} AND ${fin}
      ORDER BY fecha, id
    `),
  ]);

  const compras: Compra606Detallada[] = [];

  for (const r of registradas as unknown as Record<string, unknown>[]) {
    const info = analizarNcf(r.referencia_encf as string);
    if (!info.valido || !info.reporta606) continue;
    const itbis = n(r.itbis_cents);
    const servicios = n(r.monto_servicios_cents);
    const bienes = n(r.monto_bienes_cents);
    // Compras de antes del registro fiscal: sin desglose, todo es bienes.
    const sinDesglose = servicios === 0 && bienes === 0;
    compras.push({
      proveedor: (r.proveedor_nombre as string | null) ?? null,
      rncProveedor: (r.proveedor_rnc as string | null) ?? null,
      ncf: info.ncf,
      ncfModificado: (r.ncf_modificado as string | null) ?? null,
      tipoBienes: (r.tipo_bienes_606 as string | null) ?? '09',
      fechaComprobante: String(r.fecha),
      fechaPago: (r.fecha_pago as string | null) ?? null,
      montoServiciosCents: servicios,
      montoBienesCents: sinDesglose ? Math.max(0, n(r.monto_total) - itbis) : bienes,
      itbisFacturadoCents: itbis,
      itbisRetenidoCents: n(r.itbis_retenido_cents),
      itbisProporcionalidadCents: 0,
      itbisAlCostoCents: n(r.itbis_al_costo_cents),
      isrTipo: r.isr_tipo_retencion == null ? null : n(r.isr_tipo_retencion),
      isrRetenidoCents: n(r.isr_retenido_cents),
      iscCents: n(r.isc_cents),
      otrosImpuestosCents: n(r.otros_impuestos_cents),
      propinaCents: n(r.propina_cents),
      formaPago: formaPago606(String(r.forma_pago), String(r.metodo_pago)),
    });
  }

  for (const d of emitidas as unknown as Record<string, unknown>[]) {
    const info = analizarNcf(d.encf as string);
    if (!info.valido) continue;
    const itbis = n(d.total_itbis);
    // Las líneas guardadas no dicen si son bien o servicio: estos comprobantes
    // (informales, gastos menores, exterior) se reportan como servicios.
    const servicios = Math.max(0, n(d.monto_total) - itbis);
    const bienes = 0;
    const ret = retencionesDeJson(d.retenciones as string | null);
    const pagoFecha = (d.pago_fecha as string | null) ?? null;
    compras.push({
      proveedor: (d.razon_social_comprador as string | null) ?? null,
      rncProveedor: (d.rnc_comprador as string | null) ?? null,
      ncf: info.ncf,
      ncfModificado: (d.ncf_modificado as string | null) ?? null,
      tipoBienes: TIPO606_CATEGORIA_GASTO_VIEJA[String(d.categoria_gasto ?? '')] ?? '02',
      fechaComprobante: String(d.fecha),
      fechaPago: pagoFecha ? pagoFecha.slice(0, 10) : null,
      montoServiciosCents: servicios,
      montoBienesCents: bienes,
      itbisFacturadoCents: itbis,
      itbisRetenidoCents: ret.itbisCents,
      itbisProporcionalidadCents: 0,
      // Gastos menores y pagos al exterior no adelantan ITBIS.
      itbisAlCostoCents: info.daCreditoItbis ? 0 : itbis,
      isrTipo: ret.isrCents > 0 ? (info.tipoBase === '17' ? 3 : 2) : null,
      isrRetenidoCents: ret.isrCents,
      iscCents: 0,
      otrosImpuestosCents: 0,
      propinaCents: 0,
      formaPago: n(d.tipo_pago) === 2 ? '4' : formaPago606('contado', (d.pago_metodo as string | null) ?? 'efectivo'),
    });
  }

  compras.sort((a, b) => a.fechaComprobante.localeCompare(b.fechaComprobante));
  return compras;
}
