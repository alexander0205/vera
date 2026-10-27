import { sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { categoriaCompra } from '@/lib/compras/categorias';
import {
  armarGastos, mesesDelPeriodo, type FilaGastoMes, type GastoMes,
} from './panorama-gastos';

export interface GastosDelPeriodo {
  meses: string[];
  gastos: GastoMes[];
  /** Gastos y compras del año por categoría, de mayor a menor. La nómina va aparte. */
  porCategoria: { categoria: string | null; label: string; centavos: number }[];
  /** La empresa tiene el módulo de nómina y quien mira puede ver empleados. */
  conNomina: boolean;
}

/** El mes RD de un timestamp, como en Gastos (`lib/compras/consultas.ts`). */
const FECHA_ECF = sql`coalesce(fecha_gasto, (coalesce(fecha_emision, created_at) AT TIME ZONE 'America/Santo_Domingo')::date)`;

/**
 * Lo que salió en cada mes del año escolar: nómina, gastos y compras.
 *
 * Mismas reglas que la pantalla de Gastos para no dar otra cifra: lo anulado o
 * rechazado no cuenta; el borrador sí (ya se gastó, falta el papel). La nómina
 * cuenta desde que se aprueba —antes es un borrador que se puede rehacer— y por
 * su fecha de pago.
 *
 * `conNomina` en false deja la nómina fuera: quien no puede ver empleados no
 * debe deducir la masa salarial restando.
 */
export async function gastosDelPeriodo(
  teamId: number, periodoId: number, hoy: string, conNomina: boolean,
): Promise<GastosDelPeriodo | null> {
  const periodos = await db.execute(sql`
    SELECT fecha_inicio::text AS fecha_inicio, fecha_fin::text AS fecha_fin
    FROM admin_escolar_periodos WHERE id = ${periodoId} AND team_id = ${teamId} LIMIT 1
  `);
  const [periodo] = periodos as unknown as { fecha_inicio: string | null; fecha_fin: string | null }[];
  if (!periodo) return null;

  const meses = mesesDelPeriodo({ fechaInicio: periodo.fecha_inicio, fechaFin: periodo.fecha_fin }, hoy);
  const desde = `${meses[0]}-01`;
  const [ua, um] = meses[meses.length - 1].split('-').map(Number);
  const hasta = new Date(Date.UTC(ua, um, 0)).toISOString().slice(0, 10);

  const [nomina, ecf, compras, categoriasEcf, categoriasCompras] = await Promise.all([
    conNomina
      ? db.execute(sql`
          SELECT to_char(coalesce(fecha_pago, to_date(periodo || '-01', 'YYYY-MM-DD')), 'YYYY-MM') AS key,
                 coalesce(sum(total_bruto_cents + total_patronal_cents), 0)::bigint AS centavos
          FROM nomina_corridas
          WHERE team_id = ${teamId} AND estado IN ('aprobada', 'pagada')
            AND coalesce(fecha_pago, to_date(periodo || '-01', 'YYYY-MM-DD')) BETWEEN ${desde}::date AND ${hasta}::date
          GROUP BY 1
        `)
      : Promise.resolve([]),
    db.execute(sql`
      SELECT to_char(${FECHA_ECF}, 'YYYY-MM') AS key, coalesce(sum(monto_total), 0)::bigint AS centavos
      FROM ecf_documents
      WHERE team_id = ${teamId} AND tipo_ecf IN ('43', '47') AND estado NOT IN ('ANULADO', 'RECHAZADO')
        AND ${FECHA_ECF} BETWEEN ${desde}::date AND ${hasta}::date
      GROUP BY 1
    `),
    db.execute(sql`
      SELECT to_char(fecha, 'YYYY-MM') AS key, clase, coalesce(sum(monto_total), 0)::bigint AS centavos
      FROM compras_locales
      WHERE team_id = ${teamId} AND estado <> 'anulada' AND fecha BETWEEN ${desde}::date AND ${hasta}::date
      GROUP BY 1, 2
    `),
    db.execute(sql`
      SELECT categoria_gasto AS categoria, coalesce(sum(monto_total), 0)::bigint AS centavos
      FROM ecf_documents
      WHERE team_id = ${teamId} AND tipo_ecf IN ('43', '47') AND estado NOT IN ('ANULADO', 'RECHAZADO')
        AND ${FECHA_ECF} BETWEEN ${desde}::date AND ${hasta}::date
      GROUP BY 1
    `),
    // La categoría de una compra es la de su línea más grande, como en Gastos.
    db.execute(sql`
      SELECT (SELECT i.categoria FROM compras_locales_items i
               WHERE i.compra_id = c.id AND i.categoria IS NOT NULL
               ORDER BY i.cantidad * i.costo_unitario DESC, i.id LIMIT 1) AS categoria,
             coalesce(sum(c.monto_total), 0)::bigint AS centavos
      FROM compras_locales c
      WHERE c.team_id = ${teamId} AND c.estado <> 'anulada' AND c.fecha BETWEEN ${desde}::date AND ${hasta}::date
      GROUP BY 1
    `),
  ]);

  type Fila = { key: string; clase?: string; categoria?: string | null; centavos: unknown };
  const filasDe = (r: unknown) => r as Fila[];
  const filas: FilaGastoMes[] = [
    ...filasDe(nomina).map((r) => ({ key: r.key, tipo: 'nomina' as const, centavos: Number(r.centavos) })),
    ...filasDe(ecf).map((r) => ({ key: r.key, tipo: 'gastos' as const, centavos: Number(r.centavos) })),
    ...filasDe(compras).map((r) => ({
      key: r.key, tipo: r.clase === 'gasto' ? 'gastos' as const : 'compras' as const, centavos: Number(r.centavos),
    })),
  ];

  const porCat = new Map<string | null, number>();
  for (const r of [...filasDe(categoriasEcf), ...filasDe(categoriasCompras)]) {
    porCat.set(r.categoria ?? null, (porCat.get(r.categoria ?? null) ?? 0) + Number(r.centavos));
  }
  const porCategoria = [...porCat]
    .filter(([, c]) => c > 0)
    .map(([categoria, centavos]) => ({ categoria, label: categoriaCompra(categoria)?.label ?? 'Sin categoría', centavos }))
    .sort((a, b) => b.centavos - a.centavos);

  return { meses, gastos: armarGastos(filas, meses, hoy), porCategoria, conNomina };
}
