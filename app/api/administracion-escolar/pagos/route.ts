import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/drizzle';
import { requireModuleAndPermission } from '@/lib/auth/api-guard';
import { sql } from 'drizzle-orm';
import { armarPagina, leerPaginacion } from '@/lib/api/paginacion';

/**
 * Los pagos del colegio, leídos de donde de verdad están.
 *
 * Antes esta ruta leía `admin_escolar_pagos`, y esa tabla lleva vacía desde que
 * el módulo dejó de registrar cobros propios (ver el POST de abajo): todo cobro
 * va atado a la factura y vive en `pagos_recibidos`, el ledger del motor de
 * facturación. Se movió el motor y se dejó el tablero conectado al motor viejo,
 * así que la pantalla de Pagos salía en blanco en un colegio con millones
 * cobrados.
 *
 * El puente entre un cobro y un alumno es la factura: `pagos_recibidos` apunta
 * al comprobante, y los cargos escolares que ese comprobante salda apuntan al
 * mismo id. De ahí salen el estudiante, el concepto y el mes.
 *
 * Una factura puede saldar VARIOS cargos —el que paga el año completo de una— y
 * entonces el cobro es uno solo. Por eso los conceptos se agregan en una línea
 * («Colegiatura, Material gastable») en vez de partir el pago en trozos que no
 * existieron: lo que entró fue un pago, y así se enseña.
 *
 * Los cobros que no vienen del colegio —una venta de mostrador del POS, por
 * ejemplo— no tienen cargo escolar detrás y no salen aquí. Es a propósito: esta
 * es la pantalla de Pagos DEL COLEGIO.
 */
export async function GET(req: NextRequest) {
  const auth = await requireModuleAndPermission('escolar', 'administracion-escolar:ver');
  if (!auth.ok) return auth.response;
  const { teamId } = auth;

  const crudo = req.nextUrl.searchParams.get('estudianteId');
  const estudianteId = crudo && /^\d+$/.test(crudo) ? parseInt(crudo, 10) : null;

  const pag = leerPaginacion(req.nextUrl);

  /**
   * Un cobro por fila. `datos` resume los cargos que salda esa factura: de ahí
   * salen el alumno y los conceptos.
   *
   * El filtro por alumno va DENTRO del agregado y también fuera: dentro para no
   * traer cobros de otros alumnos, fuera para descartar la factura entera si
   * ninguno de sus cargos es del alumno pedido.
   */
  const base = sql`
    SELECT
      p.id,
      p.monto_centavos                                  AS "montoCentavos",
      p.fecha_pago                                      AS "fechaPago",
      p.metodo,
      p.referencia,
      p.notas,
      p.created_at                                      AS "createdAt",
      p.ecf_document_id                                 AS "facturaId",
      d.estudiante_id                                   AS "estudianteId",
      d.estudiante,
      d.apellidos                                       AS "estudianteApellidos",
      d.concepto,
      d.mes,
      d.anio,
      d.cargo_id                                        AS "cargoId"
    FROM pagos_recibidos p
    JOIN LATERAL (
      SELECT
        min(g.id)                                       AS cargo_id,
        min(g.estudiante_id)                            AS estudiante_id,
        min(e.nombres)                                  AS estudiante,
        min(e.apellidos)                                AS apellidos,
        string_agg(DISTINCT cp.nombre, ', ' ORDER BY cp.nombre) AS concepto,
        min(g.mes)                                      AS mes,
        min(g.anio)                                     AS anio
      FROM admin_escolar_cargos g
      JOIN admin_escolar_estudiantes e     ON e.id  = g.estudiante_id
      JOIN admin_escolar_conceptos_pago cp ON cp.id = g.concepto_id
      WHERE g.team_id = ${teamId}
        AND g.ecf_document_id = p.ecf_document_id
        ${estudianteId ? sql`AND g.estudiante_id = ${estudianteId}` : sql``}
    ) d ON d.estudiante_id IS NOT NULL
    WHERE p.team_id = ${teamId}
  `;

  const [filas, totales] = await Promise.all([
    db.execute(sql`${base} ORDER BY p.fecha_pago DESC, p.id DESC LIMIT ${pag.limit} OFFSET ${pag.offset}`),
    db.execute(sql`SELECT count(*)::int AS total FROM (${base}) t`),
  ]);

  // `db.execute` con el driver de Neon devuelve el array de filas directamente,
  // no un objeto con `.rows`.
  const total = Number((totales as unknown as { total: number }[])[0]?.total ?? 0);
  const pagina = armarPagina(filas as unknown as Record<string, unknown>[], total, pag);
  return NextResponse.json({ pagos: pagina.datos, ...pagina });
}

/**
 * DEPRECADO. El módulo escolar ya no registra pagos propios: todo cobro va
 * atado a la factura y vive en el ledger `pagos_recibidos` del motor de
 * facturación (regla de Alex — no crear un sistema de cobro paralelo). Para
 * cobrar un cargo: vincúlalo a una factura y registra el cobro en la factura
 * (/dashboard/facturas/[id] o Cuentas por Cobrar). El saldo del cargo se
 * refleja de la factura vía sincronizarSaldosDesdeFacturas.
 */
export async function POST() {
  return NextResponse.json(
    { error: 'Los pagos escolares se registran en la factura vinculada, no aquí. Abre la factura del cargo para cobrar.' },
    { status: 409 },
  );
}
