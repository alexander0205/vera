/**
 * Lectura de los datos del reporte fiscal de un mes (solo lectura, una empresa).
 * El armado del libro está en `reporte-fiscal.ts` y la descarga en
 * `app/api/asistente/reporte-fiscal`.
 */
import 'server-only';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { getTeamProfile } from '@/lib/db/queries';
import { cargarCompras606 } from '@/lib/compras/cargar606';
import { rangoDelMes } from '@/lib/nomina/periodos';
import type { CobroFiscal, DatosFiscales, VentaFiscal } from './reporte-fiscal';

const n = (v: unknown) => Number(v ?? 0);
const FECHA_DR = `(d.fecha_emision AT TIME ZONE 'America/Santo_Domingo')::date`;

export async function cargarDatosFiscales(teamId: number, anio: number, mes: number): Promise<DatosFiscales> {
  const { inicio, fin } = rangoDelMes(`${anio}-${String(mes).padStart(2, '0')}`);

  const [team, compras, filasVentas, filasCobros, filasAnuladas] = await Promise.all([
    getTeamProfile(teamId),
    cargarCompras606(teamId, inicio, fin),
    db.execute(sql`
      SELECT d.id, to_char(${sql.raw(FECHA_DR)}, 'YYYY-MM-DD') AS fecha,
             coalesce(d.codigo, d.encf, '#' || d.id::text) AS codigo,
             coalesce(nullif(d.razon_social_comprador, ''), c.razon_social) AS cliente,
             coalesce(nullif(d.rnc_comprador, ''), c.rnc) AS rnc,
             d.encf, d.tipo_ecf, d.monto_total, d.total_itbis,
             coalesce((SELECT sum(p.monto_centavos) FROM pagos_recibidos p WHERE p.ecf_document_id = d.id AND p.team_id = d.team_id), 0) AS cobrado,
             d.origen_recurrente_id, d.client_id, d.periodo_recurrente
      FROM ecf_documents d
      LEFT JOIN clients c ON c.id = d.client_id AND c.team_id = d.team_id
      WHERE d.team_id = ${teamId}
        AND d.tipo_ecf NOT IN ('41', '43', '47')
        AND d.estado <> 'ANULADO' AND coalesce(d.estado_pago, '') <> 'ANULADA'
        AND ${sql.raw(FECHA_DR)} BETWEEN ${inicio} AND ${fin}
      ORDER BY fecha, d.id
    `),
    db.execute(sql`
      SELECT to_char(p.fecha_pago, 'YYYY-MM-DD') AS fecha,
             coalesce(d.codigo, d.encf, '#' || d.id::text) AS codigo,
             coalesce(nullif(d.razon_social_comprador, ''), c.razon_social) AS cliente,
             p.metodo, p.monto_centavos, p.referencia
      FROM pagos_recibidos p
      JOIN ecf_documents d ON d.id = p.ecf_document_id AND d.team_id = p.team_id
      LEFT JOIN clients c ON c.id = d.client_id AND c.team_id = d.team_id
      WHERE p.team_id = ${teamId}
        AND d.tipo_ecf NOT IN ('41', '43', '47')
        AND d.estado <> 'ANULADO' AND coalesce(d.estado_pago, '') <> 'ANULADA'
        AND p.fecha_pago BETWEEN ${inicio} AND ${fin}
      ORDER BY p.fecha_pago, p.id
    `),
    db.execute(sql`
      SELECT count(*)::int AS cantidad, coalesce(sum(d.monto_total), 0) AS total
      FROM ecf_documents d
      WHERE d.team_id = ${teamId}
        AND d.tipo_ecf NOT IN ('41', '43', '47')
        AND (d.estado = 'ANULADO' OR d.estado_pago = 'ANULADA')
        AND ${sql.raw(FECHA_DR)} BETWEEN ${inicio} AND ${fin}
    `),
  ]);

  const ventas: VentaFiscal[] = (filasVentas as unknown as Record<string, unknown>[]).map((r) => {
    const tipo = String(r.tipo_ecf ?? 'sin-ncf');
    // Las notas de crédito restan: así los totales del mes quedan netos.
    const signo = tipo === '34' ? -1 : 1;
    return {
      fecha: String(r.fecha),
      codigo: String(r.codigo),
      cliente: (r.cliente as string | null) ?? null,
      rnc: (r.rnc as string | null) ?? null,
      ncf: (r.encf as string | null) ?? null,
      tipo,
      totalCents: signo * n(r.monto_total),
      itbisCents: signo * n(r.total_itbis),
      cobradoCents: n(r.cobrado),
      automatica: r.origen_recurrente_id != null,
      claveRepetida: r.origen_recurrente_id != null
        ? `${r.origen_recurrente_id}|${r.client_id ?? ''}|${r.periodo_recurrente ?? ''}`
        : null,
    };
  });

  const cobros: CobroFiscal[] = (filasCobros as unknown as Record<string, unknown>[]).map((r) => ({
    fecha: String(r.fecha),
    codigo: String(r.codigo),
    cliente: (r.cliente as string | null) ?? null,
    metodo: String(r.metodo ?? 'otro'),
    montoCents: n(r.monto_centavos),
    referencia: (r.referencia as string | null) ?? null,
  }));

  const an = (filasAnuladas as unknown as Record<string, unknown>[])[0] ?? {};
  const generadoEn = new Date()
    .toLocaleDateString('es-DO', { timeZone: 'America/Santo_Domingo', day: '2-digit', month: '2-digit', year: 'numeric' })
    .replace(/\//g, '-');

  return {
    empresa: team?.name ?? 'Mi empresa',
    rnc: team?.rnc ?? null,
    anio, mes, generadoEn,
    ventas, cobros, compras,
    anuladas: { cantidad: n(an.cantidad), totalCents: n(an.total) },
  };
}
