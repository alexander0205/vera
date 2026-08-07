/**
 * GET /api/facturas-recurrentes/[id]/generadas
 *
 * Facturas emitidas por un plan recurrente, con lo ESENCIAL para el desglose
 * expandible del listado: código, estado de cobro, saldo y mora (aplicada +
 * pendiente). No es el timeline completo del detalle — solo lo justo para
 * mostrar de un vistazo cuánta mora se está aplicando a las facturas del plan.
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/drizzle';
import { ecfDocuments } from '@/lib/db/schema';
import { getTeamIdForUser } from '@/lib/db/queries';
import { and, eq, ne, desc, sql } from 'drizzle-orm';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const teamId = await getTeamIdForUser();
  if (!teamId) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

  const { id } = await params;
  const numId = parseInt(id, 10);
  if (isNaN(numId)) return NextResponse.json({ error: 'ID inválido' }, { status: 400 });

  const rows = await db
    .select({
      id:          ecfDocuments.id,
      codigo:      ecfDocuments.codigo,
      encf:        ecfDocuments.encf,
      fechaEmision: ecfDocuments.fechaEmision,
      montoTotal:  ecfDocuments.montoTotal,
      estadoPago:  ecfDocuments.estadoPago,
      // pago del capital + mora aplicada/pendiente de las ND atadas a la factura.
      pagado: sql<number>`coalesce((
        SELECT SUM(monto_centavos) FROM pagos_recibidos
        WHERE pagos_recibidos.ecf_document_id = ecf_documents.id
      ), 0)`,
      moraAplicada: sql<number>`coalesce((
        SELECT SUM(nd.monto_total) FROM ecf_documents AS nd
        WHERE nd.mora_origen_id = ecf_documents.id AND nd.estado != 'ANULADO'
      ), 0)`,
      moraPendiente: sql<number>`coalesce((
        SELECT SUM(nd.monto_total - coalesce((
          SELECT SUM(monto_centavos) FROM pagos_recibidos
          WHERE pagos_recibidos.ecf_document_id = nd.id
        ), 0))
        FROM ecf_documents AS nd
        WHERE nd.mora_origen_id = ecf_documents.id
          AND nd.estado != 'ANULADO'
          AND (nd.monto_total - coalesce((
            SELECT SUM(monto_centavos) FROM pagos_recibidos
            WHERE pagos_recibidos.ecf_document_id = nd.id
          ), 0)) > 0
      ), 0)`,
    })
    .from(ecfDocuments)
    .where(and(
      eq(ecfDocuments.origenRecurrenteId, numId),
      eq(ecfDocuments.teamId, teamId),
      ne(ecfDocuments.estado, 'ANULADO'),
    ))
    .orderBy(desc(ecfDocuments.fechaEmision))
    .limit(50);

  const generadas = rows.map(r => {
    const pagado = Number(r.pagado);
    return {
      id:            r.id,
      codigo:        r.codigo,
      encf:          r.encf,
      fechaEmision:  r.fechaEmision,
      montoTotal:    r.montoTotal,
      estadoPago:    r.estadoPago,
      saldo:         Math.max(0, r.montoTotal - pagado),
      moraAplicada:  Number(r.moraAplicada),
      moraPendiente: Number(r.moraPendiente),
    };
  });

  return NextResponse.json({ generadas });
}
