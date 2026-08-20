/**
 * GET /api/caja/turnos/[id]/detalle — qué pasó en un turno, para revisar el cierre.
 *
 * Devuelve AGREGADOS, no el listado completo: un turno de colegio en día de pago
 * puede tener cientos de comprobantes, y volcarlos haría la hoja inservible (y la
 * consulta cara). Lo que se manda:
 *
 *   pagos      — totales por método. Sólo el efectivo entra al cuadre; el resto
 *                se cobró pero nunca pasó por la gaveta.
 *   resumen    — conteos y totales: facturado, pendiente, cuántos anulados.
 *   excepciones— SOLO lo que hay que mirar fila por fila: anulados y lo que quedó
 *                a crédito. Las ventas cobradas completas son la mayoría y no
 *                dicen nada. Acotado a EXCEPCIONES_MAX; si hay más se informa.
 *
 * Ojo con `facturado` vs `totalCobros`: son conjuntos distintos y no tienen por
 * qué coincidir. Un cobro de cuenta por cobrar suma a `totalCobros` aunque su
 * factura sea de otro turno; una venta a crédito suma a `facturado` sin aportar
 * un peso. Esa diferencia es justo lo que el owner necesita ver y antes no
 * aparecía en ninguna parte.
 *
 * Accesible para cualquier miembro con caja:ver del equipo.
 */

import { NextRequest, NextResponse } from 'next/server';
import { and, eq, sql } from 'drizzle-orm';
import { requirePermission } from '@/lib/auth/api-guard';
import { labelMetodo } from '@/lib/pagos/metodos';
import { db } from '@/lib/db/drizzle';
import {
  cajaTurnos, cajaMovimientos, pagosRecibidos,
  ecfDocuments, users, teams,
} from '@/lib/db/schema';

/** Máximo de excepciones (anulados / a crédito) que se listan. */
const EXCEPCIONES_MAX = 20;

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requirePermission('caja:ver');
  if (!auth.ok) return auth.response;
  const { teamId } = auth;

  const { id } = await params;
  const turnoId = Number(id);
  if (!Number.isInteger(turnoId) || turnoId <= 0) {
    return NextResponse.json({ error: 'Turno inválido' }, { status: 400 });
  }

  // Turno — verificar que pertenece al equipo
  const [turno] = await db
    .select()
    .from(cajaTurnos)
    .where(and(eq(cajaTurnos.id, turnoId), eq(cajaTurnos.teamId, teamId)))
    .limit(1);

  if (!turno) {
    return NextResponse.json({ error: 'Turno no encontrado' }, { status: 404 });
  }

  // Cargar todo en paralelo
  const [
    cajeroRows,
    aprobadorRows,
    teamRows,
    movimientos,
    pagosPorMetodo,
    cobrosCountRows,
    resumenRows,
    excepcionesRows,
    cobrosDetalleRows,
  ] = await Promise.all([
    // Cajero
    db.select({ name: users.name, email: users.email })
      .from(users)
      .where(eq(users.id, turno.usuarioId))
      .limit(1),

    // Aprobador (puede ser null)
    turno.aprobadoPor
      ? db.select({ name: users.name, email: users.email })
          .from(users)
          .where(eq(users.id, turno.aprobadoPor))
          .limit(1)
      : Promise.resolve([]),

    // Nombre del equipo
    db.select({ razonSocial: teams.razonSocial, nombreComercial: teams.nombreComercial })
      .from(teams)
      .where(eq(teams.id, teamId))
      .limit(1),

    // Movimientos del turno (el turno ya se validó del team; el filtro teamId
    // es defensa en profundidad).
    db.select()
      .from(cajaMovimientos)
      .where(and(
        eq(cajaMovimientos.teamId, teamId),
        eq(cajaMovimientos.turnoId, turnoId),
      ))
      .orderBy(cajaMovimientos.createdAt),

    // Pagos del turno agrupados por método. Se excluyen los cobros de
    // comprobantes ANULADOS (su fila pagos_recibidos puede seguir viva tras la
    // anulación) para que el desglose cuadre con lib/caja/core.
    db.select({
        metodo: pagosRecibidos.metodo,
        total:  sql<number>`coalesce(sum(${pagosRecibidos.montoCentavos}), 0)`,
        cuenta: pagosRecibidos.cuenta,
      })
      .from(pagosRecibidos)
      .innerJoin(ecfDocuments, eq(ecfDocuments.id, pagosRecibidos.ecfDocumentId))
      .where(and(
        eq(pagosRecibidos.teamId, teamId),
        eq(pagosRecibidos.turnoCajaId, turnoId),
        sql`${ecfDocuments.estado} <> 'ANULADO'`,
      ))
      .groupBy(pagosRecibidos.metodo, pagosRecibidos.cuenta),

    // Cuántos cobros hubo. Sólo el conteo: un turno de colegio en día de pago
    // puede tener cientos, y listarlos uno por uno haría la hoja inservible.
    db.execute<{ n: number }>(sql`
      SELECT count(*)::int AS n
      FROM pagos_recibidos p
      JOIN ecf_documents d ON d.id = p.ecf_document_id
      WHERE p.team_id = ${teamId} AND p.turno_caja_id = ${turnoId}
        AND d.estado <> 'ANULADO'
    `),

    // Resumen agregado de los comprobantes del turno, en una sola pasada.
    // `pagado` sale de un subselect por documento; GREATEST evita que un
    // sobrepago reste del pendiente de otro.
    db.execute<{
      cantidad: number; anulados: number; facturado: number; pendiente: number; con_pendiente: number;
    }>(sql`
      SELECT
        count(*)::int                                                        AS cantidad,
        count(*) FILTER (WHERE estado = 'ANULADO')::int                      AS anulados,
        coalesce(sum(monto_total) FILTER (WHERE estado <> 'ANULADO'), 0)::bigint AS facturado,
        coalesce(sum(GREATEST(0, monto_total - pagado))
                 FILTER (WHERE estado <> 'ANULADO'), 0)::bigint              AS pendiente,
        count(*) FILTER (WHERE estado <> 'ANULADO' AND monto_total - pagado > 0)::int AS con_pendiente
      FROM (
        SELECT d.id, d.estado, d.monto_total,
               coalesce((SELECT sum(p.monto_centavos) FROM pagos_recibidos p
                         WHERE p.ecf_document_id = d.id), 0) AS pagado
        FROM ecf_documents d
        WHERE d.team_id = ${teamId} AND d.turno_caja_id = ${turnoId}
      ) t
    `),

    // Sólo las EXCEPCIONES: anulados y lo que quedó a crédito. Es lo único que
    // el owner necesita revisar fila por fila; las ventas cobradas completas no
    // le dicen nada y son la mayoría. Acotado — si hay más, se dice cuántas.
    db.execute<{
      id: number; codigo: string | null; encf: string | null; estado: string;
      cliente: string | null; monto_total: number; pagado: number;
    }>(sql`
      SELECT id, codigo, encf, estado, razon_social_comprador AS cliente, monto_total, pagado
      FROM (
        SELECT d.id, d.codigo, d.encf, d.estado, d.razon_social_comprador, d.monto_total,
               coalesce((SELECT sum(p.monto_centavos) FROM pagos_recibidos p
                         WHERE p.ecf_document_id = d.id), 0) AS pagado
        FROM ecf_documents d
        WHERE d.team_id = ${teamId} AND d.turno_caja_id = ${turnoId}
      ) t
      WHERE estado = 'ANULADO' OR monto_total - pagado > 0
      ORDER BY (monto_total - pagado) DESC
      LIMIT ${EXCEPCIONES_MAX + 1}
    `),

    // Cobro por cobro, con su factura y su cliente.
    //
    // Es lo que hay que poder mirar cuando el conteo no cuadra: los agregados
    // dicen CUÁNTO se esperaba, y esto dice DE DÓNDE salió cada peso. Sin esta
    // lista, entender un descuadre obligaba a consultar la base de datos —fue
    // exactamente lo que hubo que hacer para explicarle a un cliente por qué su
    // caja decía 21 mil y él tenía otra cifra en la cabeza.
    //
    // Acotado por turno, así que son decenas de filas, no miles. Se ordena por
    // hora: el cajero reconstruye su día leyendo de arriba abajo.
    db.execute<{
      id: number; metodo: string | null; monto_centavos: number; created_at: string;
      referencia: string | null; codigo: string | null; encf: string | null;
      cliente: string | null; estado: string;
    }>(sql`
      SELECT p.id, p.metodo, p.monto_centavos, p.created_at, p.referencia,
             d.codigo, d.encf, d.razon_social_comprador AS cliente, d.estado
        FROM pagos_recibidos p
        JOIN ecf_documents d ON d.id = p.ecf_document_id
       WHERE p.team_id = ${teamId} AND p.turno_caja_id = ${turnoId}
         AND d.estado <> 'ANULADO'
       ORDER BY p.created_at
    `),
  ]);

  const cajero   = cajeroRows[0]   ?? null;
  const aprobador = aprobadorRows[0] ?? null;
  const teamRow  = teamRows[0];
  const teamName = teamRow?.nombreComercial || teamRow?.razonSocial || `Equipo #${teamId}`;

  // Sólo el efectivo llega a la gaveta, así que es lo único que el conteo físico
  // del cierre puede desmentir. Tarjeta/transferencia se cobran igual pero no
  // entran al esperado: hay que poder distinguirlos de un vistazo.
  const esEfectivo = (m: string | null) => ['efectivo', 'cash'].includes((m ?? '').toLowerCase());

  const efectivoCentavos = pagosPorMetodo
    .filter(p => esEfectivo(p.metodo))
    .reduce((s, p) => s + Number(p.total), 0);

  // Consolidar por etiqueta legible (fuente única lib/pagos/metodos; une efectivo/cash)
  const pagosConsolidados = new Map<string, { total: number; efectivo: boolean }>();
  for (const p of pagosPorMetodo) {
    const key = labelMetodo(p.metodo);
    const prev = pagosConsolidados.get(key);
    pagosConsolidados.set(key, {
      total: (prev?.total ?? 0) + Number(p.total),
      efectivo: prev?.efectivo || esEfectivo(p.metodo),
    });
  }
  const pagos = Array.from(pagosConsolidados.entries())
    .map(([metodo, v]) => ({ metodo, totalCentavos: v.total, esEfectivo: v.efectivo }))
    .sort((a, b) => b.totalCentavos - a.totalCentavos);  // mayor a menor

  const totalCobrosCentavos = pagos.reduce((s, p) => s + p.totalCentavos, 0);
  // Lo cobrado que NO llega a la gaveta (tarjeta, transferencia…).
  const otrosMetodosCentavos = totalCobrosCentavos - efectivoCentavos;

  // Agregados: los calcula Postgres en una pasada, no se traen las filas.
  const r = (resumenRows as unknown as Array<{
    cantidad: number; anulados: number; facturado: string | number;
    pendiente: string | number; con_pendiente: number;
  }>)[0];
  const resumen = {
    cantidadCobros:      Number((cobrosCountRows as unknown as Array<{ n: number }>)[0]?.n ?? 0),
    cantidadComprobantes: Number(r?.cantidad ?? 0),
    cantidadAnulados:    Number(r?.anulados ?? 0),
    cantidadConPendiente: Number(r?.con_pendiente ?? 0),
  };
  const totalFacturadoCentavos = Number(r?.facturado ?? 0);
  const totalPendienteCentavos = Number(r?.pendiente ?? 0);

  // Se pidió EXCEPCIONES_MAX + 1 para saber si hay más sin traerlas todas.
  const filas = excepcionesRows as unknown as Array<{
    id: number; codigo: string | null; encf: string | null; estado: string;
    cliente: string | null; monto_total: string | number; pagado: string | number;
  }>;
  const hayMasExcepciones = filas.length > EXCEPCIONES_MAX;
  const excepciones = filas.slice(0, EXCEPCIONES_MAX).map(d => {
    const total = Number(d.monto_total ?? 0);
    const pagado = Number(d.pagado ?? 0);
    return {
      id: d.id,
      codigo: d.codigo,
      encf: d.encf,
      estado: d.estado,
      cliente: d.cliente,
      totalCentavos: total,
      pagadoCentavos: pagado,
      pendienteCentavos: Math.max(0, total - pagado),
    };
  });

  // Cobro por cobro, ya traducido a lo que la tabla pinta.
  const cobros = (cobrosDetalleRows as unknown as Array<{
    id: number; metodo: string | null; monto_centavos: string | number; created_at: string;
    referencia: string | null; codigo: string | null; encf: string | null;
    cliente: string | null; estado: string;
  }>).map(c => ({
    id: c.id,
    metodo: labelMetodo(c.metodo),
    esEfectivo: esEfectivo(c.metodo),
    montoCentavos: Number(c.monto_centavos ?? 0),
    fecha: c.created_at,
    referencia: c.referencia,
    codigo: c.codigo,
    encf: c.encf,
    cliente: c.cliente,
    estado: c.estado,
  }));

  return NextResponse.json({
    turno,
    cajero,
    aprobador,
    teamName,
    pagos,
    cobros,
    totalCobrosCentavos,
    // El efectivo es lo único que el conteo físico puede desmentir; el resto se
    // cobró pero nunca pasó por la gaveta. Separarlos evita que el owner busque
    // en efectivo un dinero que entró por tarjeta.
    efectivoCentavos,
    otrosMetodosCentavos,
    movimientos,
    resumen,
    excepciones,
    hayMasExcepciones,
    totalFacturadoCentavos,
    totalPendienteCentavos,
  });
}
