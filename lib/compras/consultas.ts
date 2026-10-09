/**
 * Lecturas de compras y gastos registrados: listado con saldos, resumen del
 * período y detalle con líneas, pagos y asientos.
 */

import { sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { categoriaCompra } from './categorias';

export interface FilaCompra {
  id: number;
  clase: 'compra' | 'gasto';
  estado: 'registrada' | 'anulada';
  fecha: string;
  proveedorNombre: string | null;
  proveedorRnc: string | null;
  ncf: string | null;
  tipoBienes606: string | null;
  categoria: string | null;
  categoriaLabel: string | null;
  montoTotal: number;
  itbisCents: number;
  itbisAdelantarCents: number;
  retencionesCents: number;
  netoCents: number;
  pagadoCents: number;
  saldoCents: number;
  formaPago: string;
  metodoPago: string;
  estadoPago: string;
  fechaVencimiento: string | null;
  lineas: number;
  conInventario: boolean;
}

const n = (v: unknown) => Number(v ?? 0);

export async function listarCompras(
  teamId: number,
  opts: { clase?: 'compra' | 'gasto'; desde?: string; hasta?: string; limit?: number } = {},
): Promise<FilaCompra[]> {
  const limit = Math.min(Math.max(opts.limit ?? 200, 1), 500);
  const filas = await db.execute(sql`
    SELECT c.id, c.clase, c.estado, to_char(c.fecha, 'YYYY-MM-DD') AS fecha,
           c.proveedor_nombre AS "proveedorNombre", c.proveedor_rnc AS "proveedorRnc",
           c.referencia_encf AS ncf, c.tipo_bienes_606 AS "tipoBienes606",
           c.monto_total AS "montoTotal", c.itbis_cents AS "itbisCents",
           greatest(0, c.itbis_cents - c.itbis_al_costo_cents) AS "itbisAdelantarCents",
           (c.itbis_retenido_cents + c.isr_retenido_cents) AS "retencionesCents",
           c.forma_pago AS "formaPago", c.metodo_pago AS "metodoPago", c.estado_pago AS "estadoPago",
           to_char(c.fecha_vencimiento, 'YYYY-MM-DD') AS "fechaVencimiento",
           coalesce((SELECT sum(p.monto_cents) FROM pagos_proveedores p WHERE p.compra_id = c.id), 0) AS "pagadoCents",
           (SELECT count(*) FROM compras_locales_items i WHERE i.compra_id = c.id) AS lineas,
           EXISTS (SELECT 1 FROM compras_locales_items i WHERE i.compra_id = c.id AND i.producto_id IS NOT NULL) AS "conInventario",
           (SELECT i.categoria FROM compras_locales_items i WHERE i.compra_id = c.id AND i.categoria IS NOT NULL
             ORDER BY i.cantidad * i.costo_unitario DESC, i.id LIMIT 1) AS categoria
    FROM compras_locales c
    WHERE c.team_id = ${teamId}
      ${opts.clase ? sql`AND c.clase = ${opts.clase}` : sql``}
      ${opts.desde ? sql`AND c.fecha >= ${opts.desde}` : sql``}
      ${opts.hasta ? sql`AND c.fecha <= ${opts.hasta}` : sql``}
    ORDER BY c.fecha DESC, c.id DESC
    LIMIT ${limit}
  `);
  return (filas as unknown as Record<string, unknown>[]).map((f) => {
    const montoTotal = n(f.montoTotal);
    const retencionesCents = n(f.retencionesCents);
    const netoCents = montoTotal - retencionesCents;
    const pagadoCents = f.formaPago === 'contado' ? netoCents : n(f.pagadoCents);
    return {
      id: n(f.id),
      clase: f.clase as FilaCompra['clase'],
      estado: f.estado as FilaCompra['estado'],
      fecha: String(f.fecha),
      proveedorNombre: (f.proveedorNombre as string | null) ?? null,
      proveedorRnc: (f.proveedorRnc as string | null) ?? null,
      ncf: (f.ncf as string | null) ?? null,
      tipoBienes606: (f.tipoBienes606 as string | null) ?? null,
      categoria: (f.categoria as string | null) ?? null,
      categoriaLabel: categoriaCompra(f.categoria as string | null)?.label ?? null,
      montoTotal,
      itbisCents: n(f.itbisCents),
      itbisAdelantarCents: n(f.itbisAdelantarCents),
      retencionesCents,
      netoCents,
      pagadoCents,
      saldoCents: f.estado === 'anulada' ? 0 : Math.max(0, netoCents - pagadoCents),
      formaPago: String(f.formaPago),
      metodoPago: String(f.metodoPago),
      estadoPago: String(f.estadoPago),
      fechaVencimiento: (f.fechaVencimiento as string | null) ?? null,
      lineas: n(f.lineas),
      conInventario: f.conInventario === true,
    };
  });
}

export interface ResumenCompras {
  cantidad: number;
  totalCents: number;
  itbisPorAdelantarCents: number;
  retencionesCents: number;
  porPagarCents: number;
}

export async function resumenCompras(teamId: number, opts: { clase?: 'compra' | 'gasto'; desde: string; hasta: string }): Promise<ResumenCompras> {
  const [f] = await db.execute<Record<string, unknown>>(sql`
    SELECT count(*)::int AS cantidad,
           coalesce(sum(c.monto_total), 0) AS total,
           coalesce(sum(greatest(0, c.itbis_cents - c.itbis_al_costo_cents)), 0) AS adelantar,
           coalesce(sum(c.itbis_retenido_cents + c.isr_retenido_cents), 0) AS retenciones,
           coalesce(sum(CASE WHEN c.forma_pago = 'credito' THEN greatest(0,
             c.monto_total - c.itbis_retenido_cents - c.isr_retenido_cents
             - coalesce((SELECT sum(p.monto_cents) FROM pagos_proveedores p WHERE p.compra_id = c.id), 0)) ELSE 0 END), 0) AS "porPagar"
    FROM compras_locales c
    WHERE c.team_id = ${teamId} AND c.estado = 'registrada'
      ${opts.clase ? sql`AND c.clase = ${opts.clase}` : sql``}
      AND c.fecha >= ${opts.desde} AND c.fecha <= ${opts.hasta}
  `);
  return {
    cantidad: n(f?.cantidad),
    totalCents: n(f?.total),
    itbisPorAdelantarCents: n(f?.adelantar),
    retencionesCents: n(f?.retenciones),
    porPagarCents: n(f?.porPagar),
  };
}

export async function detalleCompra(teamId: number, compraId: number) {
  const [c] = await db.execute<Record<string, unknown>>(sql`
    SELECT c.*, to_char(c.fecha, 'YYYY-MM-DD') AS fecha_ymd,
           to_char(c.fecha_pago, 'YYYY-MM-DD') AS fecha_pago_ymd,
           to_char(c.fecha_vencimiento, 'YYYY-MM-DD') AS fecha_vencimiento_ymd,
           u.name AS registrado_por, ua.name AS anulada_por_nombre,
           (SELECT a.id FROM contabilidad_asientos a WHERE a.team_id = c.team_id AND a.origen_tipo = 'compra' AND a.origen_id = c.id) AS asiento_id,
           (SELECT a.id FROM contabilidad_asientos a WHERE a.team_id = c.team_id AND a.origen_tipo = 'compra_anulada' AND a.origen_id = c.id) AS asiento_anulacion_id
    FROM compras_locales c
    LEFT JOIN users u ON u.id = c.created_by
    LEFT JOIN users ua ON ua.id = c.anulada_por
    WHERE c.team_id = ${teamId} AND c.id = ${compraId}
  `);
  if (!c) return null;

  const items = await db.execute<Record<string, unknown>>(sql`
    SELECT i.id, i.producto_id, p.nombre AS producto_nombre, p.referencia, i.descripcion, i.categoria,
           i.cantidad, i.costo_unitario, i.itbis_tasa, i.itbis_cents, i.es_servicio, al.nombre AS almacen
    FROM compras_locales_items i
    LEFT JOIN products p ON p.id = i.producto_id
    LEFT JOIN almacenes al ON al.id = i.almacen_id
    WHERE i.compra_id = ${compraId}
    ORDER BY i.id
  `);
  const pagos = await db.execute<Record<string, unknown>>(sql`
    SELECT id, monto_cents, metodo, to_char(fecha_pago, 'YYYY-MM-DD') AS fecha_pago, referencia
    FROM pagos_proveedores WHERE team_id = ${teamId} AND compra_id = ${compraId}
    ORDER BY fecha_pago, id
  `);

  const montoTotal = n(c.monto_total);
  const retenciones = n(c.itbis_retenido_cents) + n(c.isr_retenido_cents);
  const neto = montoTotal - retenciones;
  const pagado = c.forma_pago === 'contado' ? neto : (pagos as unknown as Record<string, unknown>[]).reduce((s, p) => s + n(p.monto_cents), 0);

  return {
    id: n(c.id),
    clase: String(c.clase),
    estado: String(c.estado),
    fecha: String(c.fecha_ymd),
    proveedorNombre: (c.proveedor_nombre as string | null) ?? null,
    proveedorRnc: (c.proveedor_rnc as string | null) ?? null,
    tipoProveedor: (c.tipo_proveedor as string | null) ?? null,
    ncf: (c.referencia_encf as string | null) ?? null,
    ncfModificado: (c.ncf_modificado as string | null) ?? null,
    tipoBienes606: (c.tipo_bienes_606 as string | null) ?? null,
    notas: (c.notas as string | null) ?? null,
    montoTotal,
    montoServiciosCents: n(c.monto_servicios_cents),
    montoBienesCents: n(c.monto_bienes_cents),
    itbisCents: n(c.itbis_cents),
    itbisAlCostoCents: n(c.itbis_al_costo_cents),
    itbisRetenidoCents: n(c.itbis_retenido_cents),
    isrTipoRetencion: c.isr_tipo_retencion == null ? null : n(c.isr_tipo_retencion),
    isrRetenidoCents: n(c.isr_retenido_cents),
    iscCents: n(c.isc_cents),
    otrosImpuestosCents: n(c.otros_impuestos_cents),
    propinaCents: n(c.propina_cents),
    retencionesCents: retenciones,
    netoCents: neto,
    pagadoCents: pagado,
    saldoCents: c.estado === 'anulada' ? 0 : Math.max(0, neto - pagado),
    formaPago: String(c.forma_pago),
    metodoPago: String(c.metodo_pago),
    estadoPago: String(c.estado_pago),
    fechaPago: (c.fecha_pago_ymd as string | null) ?? null,
    fechaVencimiento: (c.fecha_vencimiento_ymd as string | null) ?? null,
    registradoPor: (c.registrado_por as string | null) ?? null,
    anuladaEn: c.anulada_en ? new Date(String(c.anulada_en)).toISOString() : null,
    anuladaPor: (c.anulada_por_nombre as string | null) ?? null,
    motivoAnulacion: (c.motivo_anulacion as string | null) ?? null,
    asientoId: c.asiento_id == null ? null : n(c.asiento_id),
    asientoAnulacionId: c.asiento_anulacion_id == null ? null : n(c.asiento_anulacion_id),
    items: (items as unknown as Record<string, unknown>[]).map((i) => ({
      id: n(i.id),
      productoId: i.producto_id == null ? null : n(i.producto_id),
      productoNombre: (i.producto_nombre as string | null) ?? null,
      referencia: (i.referencia as string | null) ?? null,
      descripcion: (i.descripcion as string | null) ?? null,
      categoria: (i.categoria as string | null) ?? null,
      categoriaLabel: categoriaCompra(i.categoria as string | null)?.label ?? null,
      cantidad: n(i.cantidad),
      costoUnitarioCents: n(i.costo_unitario),
      subtotalCents: n(i.cantidad) * n(i.costo_unitario),
      itbisTasa: String(i.itbis_tasa),
      itbisCents: n(i.itbis_cents),
      esServicio: i.es_servicio === true,
      almacen: (i.almacen as string | null) ?? null,
    })),
    pagos: (pagos as unknown as Record<string, unknown>[]).map((p) => ({
      id: n(p.id), montoCents: n(p.monto_cents), metodo: String(p.metodo), fechaPago: String(p.fecha_pago), referencia: (p.referencia as string | null) ?? null,
    })),
  };
}

export type DetalleCompra = NonNullable<Awaited<ReturnType<typeof detalleCompra>>>;

export interface GastoEcf {
  id: number;
  encf: string | null;
  tipoEcf: string;
  estado: string;
  estadoPago: string;
  proveedor: string | null;
  rncProveedor: string | null;
  ncfProveedor: string | null;
  categoriaGasto: string | null;
  pagoMetodo: string | null;
  pagoCuenta: string | null;
  montoTotal: number;
  totalRetenciones: number;
  /** Lo pagado al proveedor (ledger pagos_recibidos). */
  pagadoCents: number;
  /** Lo que falta pagarle: total menos lo retenido (va a la DGII) menos lo pagado. */
  saldoCents: number;
  fecha: string;
}

/** Gastos menores (e43) y pagos al exterior (e47) del período, por la fecha del gasto. */
export async function listarGastosEcf(teamId: number, desde: string, hasta: string): Promise<GastoEcf[]> {
  const filas = await db.execute(sql`
    SELECT id, encf, tipo_ecf AS "tipoEcf", estado, estado_pago AS "estadoPago",
           razon_social_comprador AS proveedor, rnc_comprador AS "rncProveedor",
           ncf_proveedor AS "ncfProveedor", categoria_gasto AS "categoriaGasto",
           pago_metodo AS "pagoMetodo", pago_cuenta AS "pagoCuenta",
           monto_total AS "montoTotal", coalesce(total_retenciones, 0) AS "totalRetenciones",
           -- Mismo criterio que el listado de facturas: el ledger, o el pago inline de los documentos viejos.
           GREATEST(
             coalesce((SELECT sum(p.monto_centavos) FROM pagos_recibidos p WHERE p.ecf_document_id = ecf_documents.id), 0),
             CASE WHEN pago_recibido = 'true' THEN coalesce(pago_valor_cts, 0) ELSE 0 END
           ) AS "pagadoCents",
           to_char(coalesce(fecha_gasto, (coalesce(fecha_emision, created_at) AT TIME ZONE 'America/Santo_Domingo')::date), 'YYYY-MM-DD') AS fecha
    FROM ecf_documents
    WHERE team_id = ${teamId} AND tipo_ecf IN ('43', '47')
      AND coalesce(fecha_gasto, (coalesce(fecha_emision, created_at) AT TIME ZONE 'America/Santo_Domingo')::date) BETWEEN ${desde} AND ${hasta}
    ORDER BY fecha DESC, id DESC
    LIMIT 500
  `);
  return (filas as unknown as Record<string, unknown>[]).map((f) => ({
    id: n(f.id),
    encf: (f.encf as string | null) ?? null,
    tipoEcf: String(f.tipoEcf),
    estado: String(f.estado),
    estadoPago: String(f.estadoPago ?? 'PENDIENTE'),
    proveedor: (f.proveedor as string | null) ?? null,
    rncProveedor: (f.rncProveedor as string | null) ?? null,
    ncfProveedor: (f.ncfProveedor as string | null) ?? null,
    categoriaGasto: (f.categoriaGasto as string | null) ?? null,
    pagoMetodo: (f.pagoMetodo as string | null) ?? null,
    pagoCuenta: (f.pagoCuenta as string | null) ?? null,
    montoTotal: n(f.montoTotal),
    totalRetenciones: n(f.totalRetenciones),
    pagadoCents: n(f.pagadoCents),
    saldoCents: Math.max(0, n(f.montoTotal) - n(f.totalRetenciones) - n(f.pagadoCents)),
    fecha: String(f.fecha),
  }));
}
