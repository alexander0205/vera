/**
 * Reportes financieros — queries.
 *
 * Cada función es un reporte. Todas:
 *  - reciben `teamId` y un rango, y NUNCA leen fuera del team (multi-tenant).
 *  - agregan en Postgres (SUM/GROUP BY) y devuelven filas pequeñas → escalan
 *    plano aunque crezcan las facturas.
 *  - reusan los predicados/constantes de `./shared`.
 *
 * El reporte producto-nivel (`ingresosPorProducto`) intenta leer la vista
 * materializada `mv_reportes_ventas_lineas` (refrescada por cron) y, si aún no
 * existe la migración, cae a una expansión en vivo de `lineasJson`. Así funciona
 * antes y después de aplicar el rollup — el rollup solo lo acelera.
 */
import { sql, and, eq, count, desc } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { ecfDocuments, pagosRecibidos, users } from '@/lib/db/schema';
import { diasVencido } from '@/lib/utils/format';
import {
  VENTA_ESTADOS, TIPOS_VENTA, TIPO_NOTA_CREDITO, TIPO_ECF_NOMBRE,
  pRango, pVentaEstados, pTiposVenta, pNotaCredito,
  truncFecha, parseLineas, claveProducto,
  type Granularidad,
} from './shared';

// ─── 1. KPIs del panel ───────────────────────────────────────────────────────

export interface Kpis {
  ingresosCents: number;      // ventas netas con ITBIS (brutas − NC)
  baseCents: number;          // base imponible (sin ITBIS)
  itbisCents: number;         // ITBIS débito fiscal del período
  numFacturas: number;
  ticketPromedioCents: number;
  porCobrarCents: number;     // cartera abierta (todas, no solo período)
  vencidoCents: number;       // cartera vencida
  tasaAceptacion: number;     // % e-CF aceptados vs emitidos (0..1)
}

export async function getKpis(teamId: number, desde: Date, hasta: Date): Promise<Kpis> {
  const [ventas, notas, aceptacion, cartera] = await Promise.all([
    db.select({
      brutas: sql<number>`coalesce(sum(${ecfDocuments.montoTotal}), 0)`,
      itbis:  sql<number>`coalesce(sum(${ecfDocuments.totalItbis}), 0)`,
      n:      count(),
    }).from(ecfDocuments).where(and(pRango(teamId, desde, hasta), pTiposVenta, pVentaEstados)),

    db.select({
      total: sql<number>`coalesce(sum(${ecfDocuments.montoTotal}), 0)`,
    }).from(ecfDocuments).where(and(pRango(teamId, desde, hasta), pNotaCredito, pVentaEstados)),

    db.select({
      emitidos:  sql<number>`count(*) filter (where ${ecfDocuments.estado} <> 'BORRADOR')`,
      aceptados: sql<number>`count(*) filter (where ${ecfDocuments.estado} IN ('ACEPTADO','ACEPTADO_CONDICIONAL'))`,
    }).from(ecfDocuments).where(pRango(teamId, desde, hasta)),

    // Cartera: saldo abierto de todo documento a crédito no anulado (independiente del rango).
    db.execute(sql`
      SELECT
        coalesce(sum(saldo), 0)::bigint AS por_cobrar,
        coalesce(sum(saldo) filter (where vencido), 0)::bigint AS vencido
      FROM (
        SELECT
          d.monto_total - coalesce((
            SELECT sum(p.monto_centavos) FROM pagos_recibidos p WHERE p.ecf_document_id = d.id
          ), 0) AS saldo,
          (d.fecha_limite_pago IS NOT NULL AND d.fecha_limite_pago::date < current_date) AS vencido
        FROM ecf_documents d
        WHERE d.team_id = ${teamId}
          AND d.estado IN ('ACEPTADO','ACEPTADO_CONDICIONAL','EN_PROCESO')
          AND d.estado_pago IN ('PENDIENTE','PARCIAL')
          AND d.tipo_ecf IN ('31','32','33','44','45')
      ) t
      WHERE saldo > 0
    `),
  ]);

  const brutas = Number(ventas[0]?.brutas ?? 0);
  const itbis  = Number(ventas[0]?.itbis ?? 0);
  const nc     = Number(notas[0]?.total ?? 0);
  const n      = Number(ventas[0]?.n ?? 0);
  const ingresos = brutas - nc;

  const emitidos  = Number(aceptacion[0]?.emitidos ?? 0);
  const aceptados = Number(aceptacion[0]?.aceptados ?? 0);

  const cRow = (cartera as unknown as Array<{ por_cobrar: string; vencido: string }>)[0];

  return {
    ingresosCents: ingresos,
    baseCents: ingresos - itbis,
    itbisCents: itbis,
    numFacturas: n,
    ticketPromedioCents: n > 0 ? Math.round(ingresos / n) : 0,
    porCobrarCents: Number(cRow?.por_cobrar ?? 0),
    vencidoCents: Number(cRow?.vencido ?? 0),
    tasaAceptacion: emitidos > 0 ? aceptados / emitidos : 0,
  };
}

// ─── 2. Tendencia de ingresos (serie temporal) ───────────────────────────────

export interface PuntoTendencia {
  periodo: string;      // YYYY-MM-DD (inicio del bucket)
  ingresosCents: number;
  itbisCents: number;
  numFacturas: number;
}

export async function getTendencia(
  teamId: number, desde: Date, hasta: Date, g: Granularidad = 'dia',
): Promise<PuntoTendencia[]> {
  const bucket = truncFecha(g);
  const rows = await db.select({
    periodo: bucket,
    ingresos: sql<number>`coalesce(sum(${ecfDocuments.montoTotal}), 0)`,
    itbis:    sql<number>`coalesce(sum(${ecfDocuments.totalItbis}), 0)`,
    n:        count(),
  })
    .from(ecfDocuments)
    .where(and(pRango(teamId, desde, hasta), pTiposVenta, pVentaEstados))
    .groupBy(bucket)
    .orderBy(bucket);

  return rows.map(r => ({
    periodo: String(r.periodo),
    ingresosCents: Number(r.ingresos),
    itbisCents: Number(r.itbis),
    numFacturas: Number(r.n),
  }));
}

// ─── 3. Ingresos por producto / servicio (+ Pareto) ──────────────────────────

export interface FilaProducto {
  clave: string;
  nombre: string;
  referencia: string | null;
  unidades: number;
  ingresosCents: number;   // base sin ITBIS
  numFacturas: number;
  pctAcumulado: number;    // Pareto (0..1)
}

export async function getIngresosPorProducto(
  teamId: number, desde: Date, hasta: Date,
): Promise<FilaProducto[]> {
  // Intento 1: vista materializada (rápida). Si no existe, fallback en vivo.
  try {
    const mv = await db.execute(sql`
      SELECT clave, nombre, referencia,
             sum(unidades)::double precision AS unidades,
             sum(base_cents)::bigint AS ingresos,
             count(distinct ecf_document_id)::int AS num_facturas
      FROM mv_reportes_ventas_lineas
      WHERE team_id = ${teamId}
        AND fecha >= ${desde.toISOString().slice(0, 10)}
        AND fecha <= ${hasta.toISOString().slice(0, 10)}
      GROUP BY clave, nombre, referencia
      ORDER BY ingresos DESC
    `);
    return armarPareto(mv as unknown as RawProducto[]);
  } catch {
    return getIngresosPorProductoLive(teamId, desde, hasta);
  }
}

interface RawProducto {
  clave: string; nombre: string; referencia: string | null;
  unidades: number | string; ingresos: number | string; num_facturas: number | string;
}

function armarPareto(rows: RawProducto[]): FilaProducto[] {
  const total = rows.reduce((s, r) => s + Number(r.ingresos), 0) || 1;
  let acum = 0;
  return rows.map(r => {
    acum += Number(r.ingresos);
    return {
      clave: r.clave,
      nombre: r.nombre,
      referencia: r.referencia,
      unidades: Number(r.unidades),
      ingresosCents: Number(r.ingresos),
      numFacturas: Number(r.num_facturas),
      pctAcumulado: acum / total,
    };
  });
}

/** Fallback en vivo: expande lineasJson en JS (correcto pero más costoso a gran escala). */
async function getIngresosPorProductoLive(
  teamId: number, desde: Date, hasta: Date,
): Promise<FilaProducto[]> {
  const docs = await db.select({
    id: ecfDocuments.id,
    lineasJson: ecfDocuments.lineasJson,
  })
    .from(ecfDocuments)
    .where(and(pRango(teamId, desde, hasta), pTiposVenta, pVentaEstados));

  const acc = new Map<string, { nombre: string; referencia: string | null; unidades: number; ingresos: number; facturas: Set<number> }>();
  for (const d of docs) {
    for (const l of parseLineas(d.lineasJson)) {
      const k = claveProducto(l);
      const cur = acc.get(k) ?? { nombre: l.nombre, referencia: l.referencia, unidades: 0, ingresos: 0, facturas: new Set() };
      cur.unidades += l.cantidad;
      cur.ingresos += l.baseCents;
      cur.facturas.add(d.id);
      acc.set(k, cur);
    }
  }

  const rows: RawProducto[] = [...acc.entries()]
    .map(([clave, v]) => ({ clave, nombre: v.nombre, referencia: v.referencia, unidades: v.unidades, ingresos: v.ingresos, num_facturas: v.facturas.size }))
    .sort((a, b) => Number(b.ingresos) - Number(a.ingresos));
  return armarPareto(rows);
}

// ─── 4. Ingresos por cliente ─────────────────────────────────────────────────

export interface FilaCliente {
  cliente: string;
  rnc: string | null;
  ingresosCents: number;
  numFacturas: number;
}

export async function getIngresosPorCliente(
  teamId: number, desde: Date, hasta: Date, limit = 100,
): Promise<FilaCliente[]> {
  const rows = await db.select({
    cliente: sql<string>`coalesce(nullif(${ecfDocuments.razonSocialComprador}, ''), 'Consumidor Final')`,
    rnc:     ecfDocuments.rncComprador,
    ingresos: sql<number>`coalesce(sum(${ecfDocuments.montoTotal}), 0)`,
    n:        count(),
  })
    .from(ecfDocuments)
    .where(and(pRango(teamId, desde, hasta), pTiposVenta, pVentaEstados))
    .groupBy(sql`coalesce(nullif(${ecfDocuments.razonSocialComprador}, ''), 'Consumidor Final')`, ecfDocuments.rncComprador)
    .orderBy(desc(sql`sum(${ecfDocuments.montoTotal})`))
    .limit(limit);

  return rows.map(r => ({ cliente: r.cliente, rnc: r.rnc, ingresosCents: Number(r.ingresos), numFacturas: Number(r.n) }));
}

// ─── 5. Ingresos por método de pago ──────────────────────────────────────────

export interface FilaMetodo { metodo: string; totalCents: number; numPagos: number; }

export async function getIngresosPorMetodo(
  teamId: number, desde: Date, hasta: Date,
): Promise<FilaMetodo[]> {
  const d0 = desde.toISOString().slice(0, 10);
  const d1 = hasta.toISOString().slice(0, 10);
  const rows = await db.select({
    metodo: pagosRecibidos.metodo,
    total:  sql<number>`coalesce(sum(${pagosRecibidos.montoCentavos}), 0)`,
    n:      count(),
  })
    .from(pagosRecibidos)
    .where(and(
      eq(pagosRecibidos.teamId, teamId),
      sql`${pagosRecibidos.fechaPago} >= ${d0}`,
      sql`${pagosRecibidos.fechaPago} <= ${d1}`,
    ))
    .groupBy(pagosRecibidos.metodo)
    .orderBy(desc(sql`sum(${pagosRecibidos.montoCentavos})`));

  return rows.map(r => ({ metodo: r.metodo, totalCents: Number(r.total), numPagos: Number(r.n) }));
}

// ─── 6. Cuentas por cobrar — antigüedad de saldos (aging) ────────────────────

export interface FilaAging {
  id: number;
  encf: string;
  cliente: string;
  fechaLimite: string | null;
  diasVencido: number;
  saldoCents: number;
  cubeta: '0-30' | '31-60' | '61-90' | '90+' | 'porVencer';
}

export interface AgingResumen {
  buckets: Record<FilaAging['cubeta'], number>;
  totalCents: number;
  filas: FilaAging[];
}

export async function getAgingCxC(teamId: number): Promise<AgingResumen> {
  const rows = await db.execute(sql`
    SELECT d.id, d.encf,
           coalesce(nullif(d.razon_social_comprador, ''), 'Consumidor Final') AS cliente,
           d.fecha_limite_pago AS fecha_limite,
           d.monto_total - coalesce((
             SELECT sum(p.monto_centavos) FROM pagos_recibidos p WHERE p.ecf_document_id = d.id
           ), 0) AS saldo
    FROM ecf_documents d
    WHERE d.team_id = ${teamId}
      AND d.estado IN ('ACEPTADO','ACEPTADO_CONDICIONAL','EN_PROCESO')
      AND d.estado_pago IN ('PENDIENTE','PARCIAL')
      AND d.tipo_ecf IN ('31','32','33','44','45')
    ORDER BY d.fecha_limite_pago NULLS LAST
  `);

  const buckets: AgingResumen['buckets'] = { 'porVencer': 0, '0-30': 0, '31-60': 0, '61-90': 0, '90+': 0 };
  const filas: FilaAging[] = [];
  let total = 0;

  for (const raw of rows as unknown as Array<{ id: number; encf: string; cliente: string; fecha_limite: string | null; saldo: string }>) {
    const saldo = Number(raw.saldo);
    if (saldo <= 0) continue;
    const dias = diasVencido(raw.fecha_limite);
    const cubeta: FilaAging['cubeta'] =
      dias <= 0 ? 'porVencer' : dias <= 30 ? '0-30' : dias <= 60 ? '31-60' : dias <= 90 ? '61-90' : '90+';
    buckets[cubeta] += saldo;
    total += saldo;
    filas.push({
      id: raw.id, encf: raw.encf, cliente: raw.cliente,
      fechaLimite: raw.fecha_limite, diasVencido: dias, saldoCents: saldo, cubeta,
    });
  }

  return { buckets, totalCents: total, filas };
}

// ─── 7. Resumen ITBIS (débito fiscal del período) ────────────────────────────

export interface ItbisResumen {
  baseCents: number;
  itbisDebitoCents: number;   // ITBIS facturado (ventas)
  itbisCreditoCents: number;  // ITBIS de compras recibidas (606)
  aPagarCents: number;        // débito − crédito
}

export async function getItbisResumen(teamId: number, desde: Date, hasta: Date): Promise<ItbisResumen> {
  const d0 = desde.toISOString().slice(0, 10);
  const d1 = hasta.toISOString().slice(0, 10);
  const [ventas, notas, compras] = await Promise.all([
    db.select({
      base:  sql<number>`coalesce(sum(${ecfDocuments.montoTotal} - ${ecfDocuments.totalItbis}), 0)`,
      itbis: sql<number>`coalesce(sum(${ecfDocuments.totalItbis}), 0)`,
    }).from(ecfDocuments).where(and(pRango(teamId, desde, hasta), pTiposVenta, pVentaEstados)),

    db.select({
      itbis: sql<number>`coalesce(sum(${ecfDocuments.totalItbis}), 0)`,
    }).from(ecfDocuments).where(and(pRango(teamId, desde, hasta), pNotaCredito, pVentaEstados)),

    // Crédito fiscal: ITBIS de e-CF recibidos (compras) en el período.
    db.execute(sql`
      SELECT coalesce(sum(total_itbis), 0)::bigint AS itbis
      FROM ecf_documents_recibidos
      WHERE team_id = ${teamId}
        AND fecha_recepcion::date >= ${d0}
        AND fecha_recepcion::date <= ${d1}
        AND estado_acuse = 'RECIBIDO'
    `),
  ]);

  const debito  = Number(ventas[0]?.itbis ?? 0) - Number(notas[0]?.itbis ?? 0);
  const credito = Number((compras as unknown as Array<{ itbis: string }>)[0]?.itbis ?? 0);
  return {
    baseCents: Number(ventas[0]?.base ?? 0),
    itbisDebitoCents: debito,
    itbisCreditoCents: credito,
    aPagarCents: Math.max(0, debito - credito),
  };
}

// ─── 8. Ventas por tipo de comprobante DGII (e31, e32, e33…) ──────────────────

export interface FilaTipo {
  tipoEcf: string;
  nombre: string;
  ingresosCents: number;
  itbisCents: number;
  numFacturas: number;
}

export async function getVentasPorTipo(
  teamId: number, desde: Date, hasta: Date,
): Promise<FilaTipo[]> {
  const rows = await db.select({
    tipoEcf:  ecfDocuments.tipoEcf,
    ingresos: sql<number>`coalesce(sum(${ecfDocuments.montoTotal}), 0)`,
    itbis:    sql<number>`coalesce(sum(${ecfDocuments.totalItbis}), 0)`,
    n:        count(),
  })
    .from(ecfDocuments)
    .where(and(pRango(teamId, desde, hasta), pVentaEstados))
    .groupBy(ecfDocuments.tipoEcf)
    .orderBy(desc(sql`sum(${ecfDocuments.montoTotal})`));

  return rows.map(r => ({
    tipoEcf: r.tipoEcf,
    nombre: TIPO_ECF_NOMBRE[r.tipoEcf] ?? `Tipo ${r.tipoEcf}`,
    ingresosCents: Number(r.ingresos),
    itbisCents: Number(r.itbis),
    numFacturas: Number(r.n),
  }));
}

// ─── 9. Ventas por usuario emisor (quién hizo la factura) ────────────────────

export interface FilaUsuario {
  usuarioId: number | null;
  nombre: string;
  ingresosCents: number;
  numFacturas: number;
}

export async function getVentasPorUsuario(
  teamId: number, desde: Date, hasta: Date,
): Promise<FilaUsuario[]> {
  const rows = await db.select({
    usuarioId: ecfDocuments.createdBy,
    nombre:    users.name,
    email:     users.email,
    ingresos:  sql<number>`coalesce(sum(${ecfDocuments.montoTotal}), 0)`,
    n:         count(),
  })
    .from(ecfDocuments)
    .leftJoin(users, eq(users.id, ecfDocuments.createdBy))
    .where(and(pRango(teamId, desde, hasta), pTiposVenta, pVentaEstados))
    .groupBy(ecfDocuments.createdBy, users.name, users.email)
    .orderBy(desc(sql`sum(${ecfDocuments.montoTotal})`));

  return rows.map(r => ({
    usuarioId: r.usuarioId,
    nombre: r.nombre || r.email || 'Sin usuario',
    ingresosCents: Number(r.ingresos),
    numFacturas: Number(r.n),
  }));
}

// ─── 10. Pagos por usuario (quién registró el cobro) ─────────────────────────

export interface FilaUsuarioPago {
  usuarioId: number | null;
  nombre: string;
  totalCents: number;
  numPagos: number;
}

export async function getPagosPorUsuario(
  teamId: number, desde: Date, hasta: Date,
): Promise<FilaUsuarioPago[]> {
  const d0 = desde.toISOString().slice(0, 10);
  const d1 = hasta.toISOString().slice(0, 10);
  const rows = await db.select({
    usuarioId: pagosRecibidos.createdBy,
    nombre:    users.name,
    email:     users.email,
    total:     sql<number>`coalesce(sum(${pagosRecibidos.montoCentavos}), 0)`,
    n:         count(),
  })
    .from(pagosRecibidos)
    .leftJoin(users, eq(users.id, pagosRecibidos.createdBy))
    .where(and(
      eq(pagosRecibidos.teamId, teamId),
      sql`${pagosRecibidos.fechaPago} >= ${d0}`,
      sql`${pagosRecibidos.fechaPago} <= ${d1}`,
    ))
    .groupBy(pagosRecibidos.createdBy, users.name, users.email)
    .orderBy(desc(sql`sum(${pagosRecibidos.montoCentavos})`));

  return rows.map(r => ({
    usuarioId: r.usuarioId,
    nombre: r.nombre || r.email || 'Sin usuario',
    totalCents: Number(r.total),
    numPagos: Number(r.n),
  }));
}
