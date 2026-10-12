/**
 * GET /api/mcp/v1/pagos — solo lectura, autenticado por API key.
 *
 * Los pagos son la contraparte de `/facturas`: allí se ve SI una factura está
 * pagada (`estadoPago`), aquí CUÁNDO, POR CUÁNTO y POR QUÉ VÍA.
 *
 * Devuelve además `total` y `count` calculados sobre TODOS los pagos que
 * cumplen el filtro, no solo sobre la página. Sin eso, «¿cuánto entré hoy en
 * efectivo?» obligaba a paginar y sumar del lado del cliente, que con una AI
 * es justo donde aparecen los números inventados.
 */
import { NextRequest, NextResponse } from 'next/server';
import { and, eq, gte, lte, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { pagosRecibidos, ecfDocuments, users } from '@/lib/db/schema';
import { requireApiKey } from '@/lib/auth/api-key-guard';
import { CAMPOS_PAGO } from '@/lib/mcp/campos-pagos';
import { idValido, fechaValida } from '@/lib/mcp/ids';

/** `fecha_pago` es una columna `date`: drizzle la entrega y la espera como
 *  'YYYY-MM-DD', no como Date. Se valida con el mismo helper que el resto y
 *  se normaliza al texto que la consulta necesita. */
function fechaIso(valor: string | null): string | null {
  const d = fechaValida(valor);
  return d ? d.toISOString().slice(0, 10) : null;
}

export async function GET(req: NextRequest) {
  const auth = await requireApiKey(req);
  if (!auth.ok) return auth.response;
  const { teamId } = auth;

  const sp = new URL(req.url).searchParams;
  const metodo = sp.get('metodo');
  const ecfDocumentId = sp.get('ecfDocumentId');
  const clientId = sp.get('clientId');
  const desde = sp.get('desde');
  const hasta = sp.get('hasta');
  const limit = Math.min(Number(sp.get('limit')) || 200, 500);
  const offset = Math.max(Number(sp.get('offset')) || 0, 0);

  const docFiltro = ecfDocumentId ? idValido(ecfDocumentId) : null;
  if (ecfDocumentId && docFiltro === null) {
    return NextResponse.json({ error: 'ecfDocumentId inválido' }, { status: 400 });
  }
  const clienteFiltro = clientId ? idValido(clientId) : null;
  if (clientId && clienteFiltro === null) {
    return NextResponse.json({ error: 'clientId inválido' }, { status: 400 });
  }
  const desdeFecha = fechaIso(desde);
  if (desde && desdeFecha === null) {
    return NextResponse.json({ error: 'desde inválido (usa YYYY-MM-DD)' }, { status: 400 });
  }
  const hastaFecha = fechaIso(hasta);
  if (hasta && hastaFecha === null) {
    return NextResponse.json({ error: 'hasta inválido (usa YYYY-MM-DD)' }, { status: 400 });
  }

  const condiciones = [eq(pagosRecibidos.teamId, teamId)];
  if (metodo) condiciones.push(eq(pagosRecibidos.metodo, metodo));
  if (docFiltro !== null) condiciones.push(eq(pagosRecibidos.ecfDocumentId, docFiltro));
  if (desdeFecha) condiciones.push(gte(pagosRecibidos.fechaPago, desdeFecha));
  if (hastaFecha) condiciones.push(lte(pagosRecibidos.fechaPago, hastaFecha));
  // Filtrar por cliente exige mirar la factura: el pago no lo lleva encima.
  // Va como subconsulta y no como join para que el join de `users` de abajo
  // siga siendo el único, y para que el conteo de totales use exactamente las
  // mismas condiciones que la página.
  if (clienteFiltro !== null) {
    condiciones.push(sql`${pagosRecibidos.ecfDocumentId} IN (
      SELECT id FROM ${ecfDocuments}
      WHERE ${ecfDocuments.teamId} = ${teamId} AND ${ecfDocuments.clientId} = ${clienteFiltro}
    )`);
  }

  const donde = and(...condiciones);

  const [pagos, [totales]] = await Promise.all([
    db
      .select({
        ...CAMPOS_PAGO,
        // El id de quien registró no le sirve a nadie; el nombre sí.
        registradoPor: users.name,
        // Para poder decir «pagó la factura X» sin una segunda llamada.
        facturaCodigo: ecfDocuments.codigo,
        facturaEncf: ecfDocuments.encf,
      })
      .from(pagosRecibidos)
      .innerJoin(ecfDocuments, eq(ecfDocuments.id, pagosRecibidos.ecfDocumentId))
      .leftJoin(users, eq(users.id, pagosRecibidos.createdBy))
      .where(donde)
      .orderBy(pagosRecibidos.fechaPago, pagosRecibidos.id)
      .limit(limit)
      .offset(offset),
    db
      .select({
        total: sql<number>`COALESCE(SUM(${pagosRecibidos.montoCentavos}), 0)::int`,
        count: sql<number>`COUNT(*)::int`,
      })
      .from(pagosRecibidos)
      .where(donde),
  ]);

  return NextResponse.json({ pagos, total: totales?.total ?? 0, count: totales?.count ?? 0 });
}
