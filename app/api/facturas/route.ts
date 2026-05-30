import { NextRequest, NextResponse } from 'next/server';
import { getUser, getTeamIdForUser } from '@/lib/db/queries';
import { db } from '@/lib/db/drizzle';
import { ecfDocuments } from '@/lib/db/schema';
import { and, eq, gte, lte, desc, like, count, or, sql } from 'drizzle-orm';

export async function GET(req: NextRequest) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const teamId = await getTeamIdForUser();
  if (!teamId) return NextResponse.json({ error: 'Sin empresa' }, { status: 400 });

  const sp = req.nextUrl.searchParams;
  const search = sp.get('search') ?? '';
  const estado = sp.get('estado') ?? '';
  const desde = sp.get('desde') ?? '';
  const hasta = sp.get('hasta') ?? '';
  // NCA-22: filtro "conNcs" — facturas con NCs/débitos asociados
  const conNcs = sp.get('conNcs') === '1' || sp.get('conNcs') === 'true';
  const limit = Math.min(parseInt(sp.get('limit') ?? '50', 10), 200);
  const offset = parseInt(sp.get('offset') ?? '0', 10);

  // Facturas históricas (estado=HISTORICA, tipoEcf='00') importadas de Alegra
  // SÍ se listan aquí como ventas — además de en /dashboard/cuentas-por-cobrar.
  const conditions = [
    eq(ecfDocuments.teamId, teamId),
  ];

  if (search) {
    conditions.push(
      or(
        like(ecfDocuments.encf, `%${search}%`),
        like(ecfDocuments.razonSocialComprador, `%${search}%`),
      )!,
    );
  }

  if (estado && estado !== 'todos') {
    conditions.push(eq(ecfDocuments.estado, estado));
  }

  if (desde) {
    conditions.push(gte(ecfDocuments.createdAt, new Date(desde)));
  }

  if (hasta) {
    conditions.push(lte(ecfDocuments.createdAt, new Date(hasta + 'T23:59:59')));
  }

  // NCA-22: solo facturas con NCs/débitos referenciándolas
  if (conNcs) {
    conditions.push(sql`EXISTS (
      SELECT 1 FROM ecf_documents AS nc
      WHERE nc.team_id = ${teamId}
        AND nc.ncf_modificado = ecf_documents.encf
    )`);
  }

  const where = and(...conditions);

  const [docs, totalRows] = await Promise.all([
    db
      .select({
        id:                   ecfDocuments.id,
        encf:                 ecfDocuments.encf,
        tipoEcf:              ecfDocuments.tipoEcf,
        estado:               ecfDocuments.estado,
        rncComprador:         ecfDocuments.rncComprador,
        razonSocialComprador: ecfDocuments.razonSocialComprador,
        emailComprador:       ecfDocuments.emailComprador,
        montoTotal:           ecfDocuments.montoTotal,
        totalItbis:           ecfDocuments.totalItbis,
        tipoPago:             ecfDocuments.tipoPago,
        fechaEmision:         ecfDocuments.fechaEmision,
        fechaLimitePago:      ecfDocuments.fechaLimitePago,
        createdAt:            ecfDocuments.createdAt,
        // Subquery correlacionada — usar nombre literal de tabla. Drizzle
        // interpola ${ecfDocuments.id} como parámetro, no como column ref,
        // causando que todas las filas devolvieran el mismo SUM.
        // Cobranza: ledger pagos_recibidos = source of truth. Fallback al pago
        // inline (pago_valor_cts) para docs legacy aún sin fila en el ledger.
        pagado: sql<number>`GREATEST(
          coalesce((
            SELECT SUM(monto_centavos) FROM pagos_recibidos
            WHERE pagos_recibidos.ecf_document_id = ecf_documents.id
          ), 0),
          CASE WHEN ecf_documents.pago_recibido = 'true'
               THEN coalesce(ecf_documents.pago_valor_cts, 0) ELSE 0 END
        )`,
      })
      .from(ecfDocuments)
      .where(where)
      .orderBy(desc(ecfDocuments.createdAt))
      .limit(limit)
      .offset(offset),
    db
      .select({ total: count() })
      .from(ecfDocuments)
      .where(where),
  ]);

  return NextResponse.json({ docs, total: totalRows[0]?.total ?? 0 });
}
