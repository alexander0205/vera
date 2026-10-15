/**
 * Formato 606 — Compras de bienes y servicios (Norma General 07-2018, DGII).
 *
 * Reúne dos fuentes del período:
 *
 *   1. Los comprobantes de proveedores registrados en Compras y Gastos
 *      (compras_locales, no anulados), con su tipo de bienes, montos de
 *      servicios y bienes, ITBIS al costo y retenciones. Los de consumo (B02/E32)
 *      no se reportan.
 *   2. Los comprobantes que emite la propia empresa: compras a informales (e41),
 *      gastos menores (e43, con el RNC de la empresa y sin adelanto de ITBIS) y
 *      pagos al exterior (e47), solo si ya se emitieron a la DGII.
 *
 * Las líneas se arman en lib/compras/fiscal.ts (lineaFormato606) y el archivo en
 * lib/compras/formato606.ts. Archivo: DGII_F_606_{RNC}_{AAAAMM}.TXT, CRLF.
 */
import { NextRequest } from 'next/server';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { getTeamIdForUser, getTeamProfile } from '@/lib/db/queries';
import { analizarNcf, formaPago606, type CompraPara606 } from '@/lib/compras/fiscal';
import { TIPO606_CATEGORIA_GASTO_VIEJA } from '@/lib/compras/categorias';
import { construirFormato606, retencionesDeJson } from '@/lib/compras/formato606';
import { rangoDelMes } from '@/lib/nomina/periodos';

const n = (v: unknown) => Number(v ?? 0);

export async function GET(req: NextRequest) {
  const teamId = await getTeamIdForUser();
  if (!teamId) return new Response('No autorizado', { status: 401 });

  const sp = req.nextUrl.searchParams;
  const anio = sp.get('anio') ?? String(new Date().getFullYear());
  const mes = (sp.get('mes') ?? String(new Date().getMonth() + 1)).padStart(2, '0');
  if (!/^\d{4}$/.test(anio) || !/^(0[1-9]|1[0-2])$/.test(mes)) return new Response('Período inválido', { status: 400 });
  const { inicio, fin } = rangoDelMes(`${anio}-${mes}`);

  const [team, registradas, emitidas] = await Promise.all([
    getTeamProfile(teamId),
    db.execute(sql`
      SELECT proveedor_rnc, referencia_encf, ncf_modificado, tipo_bienes_606,
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
      SELECT encf, tipo_ecf, rnc_comprador, ncf_modificado, categoria_gasto, retenciones,
             monto_total, total_itbis, tipo_pago, pago_metodo, pago_fecha,
             to_char(coalesce(fecha_gasto, (fecha_emision AT TIME ZONE 'America/Santo_Domingo')::date), 'YYYY-MM-DD') AS fecha
      FROM ecf_documents
      WHERE team_id = ${teamId} AND tipo_ecf IN ('41', '43', '47')
        AND estado IN ('ACEPTADO', 'ACEPTADO_CONDICIONAL', 'EN_PROCESO')
        AND coalesce(fecha_gasto, (fecha_emision AT TIME ZONE 'America/Santo_Domingo')::date) BETWEEN ${inicio} AND ${fin}
      ORDER BY fecha, id
    `),
  ]);

  const compras: CompraPara606[] = [];

  for (const r of registradas as unknown as Record<string, unknown>[]) {
    const info = analizarNcf(r.referencia_encf as string);
    if (!info.valido || !info.reporta606) continue;
    const itbis = n(r.itbis_cents);
    const servicios = n(r.monto_servicios_cents);
    const bienes = n(r.monto_bienes_cents);
    // Compras de antes del registro fiscal: sin desglose, todo es bienes.
    const sinDesglose = servicios === 0 && bienes === 0;
    compras.push({
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
  const archivo = construirFormato606({ rncEmpresa: team?.rnc ?? '', periodo: `${anio}${mes}`, compras });

  return new Response(archivo.contenido, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Content-Disposition': `attachment; filename="${archivo.nombreArchivo}"`,
    },
  });
}
