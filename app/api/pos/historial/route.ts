/**
 * GET /api/pos/historial — recibos cobrados en un turno de caja (pos:vender).
 *
 * "Todo lo cobrado" del turno: lee ecf_documents por turno_caja_id, incluidos
 * los tickets sin-ncf de demo (no filtra por tipo fiscal). Cada fila trae el
 * número de orden (codigo), método(s) de pago, tipo de orden y la mesa si vino
 * de una comanda. Sólo lectura — no muta nada fiscal (Fase 1).
 *
 * Query params:
 *   turnoId?   — turno específico (validado por team). Default: turno abierto del usuario.
 *   metodo?    — filtra por método de pago (efectivo|tarjeta|transferencia|cuenta-estudiante|credito).
 *   tipoOrden? — filtra por tipo de orden (comer-aqui|para-llevar|delivery|mostrador).
 */

import { NextRequest, NextResponse } from 'next/server';
import { and, eq, desc, inArray, isNotNull } from 'drizzle-orm';
import { requireModuleAndPermission } from '@/lib/auth/api-guard';
import { db } from '@/lib/db/drizzle';
import { ecfDocuments, pagosRecibidos, users, comandas, mesas, cajaTurnos } from '@/lib/db/schema';
import { getTurnoAbierto } from '@/lib/caja/core';

export async function GET(req: NextRequest) {
  const auth = await requireModuleAndPermission('pos', 'pos:vender');
  if (!auth.ok) return auth.response;
  const { teamId, user } = auth;

  const sp = req.nextUrl.searchParams;
  const metodoFiltro    = sp.get('metodo')    || null;
  const tipoOrdenFiltro = sp.get('tipoOrden') || null;
  const turnoIdParam    = sp.get('turnoId');

  // Turno objetivo: el pedido (validado por team) o el turno abierto del usuario.
  let turnoId: number | null = null;
  if (turnoIdParam) {
    const tid = Number(turnoIdParam);
    if (!Number.isInteger(tid)) return NextResponse.json({ error: 'turnoId inválido' }, { status: 400 });
    const [t] = await db.select({ id: cajaTurnos.id })
      .from(cajaTurnos)
      .where(and(eq(cajaTurnos.id, tid), eq(cajaTurnos.teamId, teamId)))
      .limit(1);
    if (!t) return NextResponse.json({ error: 'Turno no encontrado' }, { status: 404 });
    turnoId = t.id;
  } else {
    const abierto = await getTurnoAbierto(teamId, user.id);
    turnoId = abierto?.id ?? null;
  }

  if (turnoId == null) {
    return NextResponse.json({ turno: null, ventas: [], total: 0 });
  }

  // Comprobantes del turno (+ cajero + mesa si vino de comanda).
  const condiciones = [
    eq(ecfDocuments.teamId, teamId),
    eq(ecfDocuments.turnoCajaId, turnoId),
    // Un turno puede contener un cobro de Facturación; tipoOrden solo lo
    // estampa el POS y evita clasificar esas facturas como recibos POS.
    isNotNull(ecfDocuments.tipoOrden),
    ...(tipoOrdenFiltro ? [eq(ecfDocuments.tipoOrden, tipoOrdenFiltro)] : []),
  ];

  const docs = await db
    .select({
      id:           ecfDocuments.id,
      codigo:       ecfDocuments.codigo,
      encf:         ecfDocuments.encf,
      tipoEcf:      ecfDocuments.tipoEcf,
      estado:       ecfDocuments.estado,
      estadoPago:   ecfDocuments.estadoPago,
      tipoOrden:    ecfDocuments.tipoOrden,
      montoTotal:   ecfDocuments.montoTotal,
      cliente:      ecfDocuments.razonSocialComprador,
      dependiente:  ecfDocuments.dependienteNombre,
      fechaEmision: ecfDocuments.fechaEmision,
      cajero:       users.name,
      cajeroEmail:  users.email,
      mesa:         mesas.nombre,
    })
    .from(ecfDocuments)
    .leftJoin(users, eq(ecfDocuments.createdBy, users.id))
    .leftJoin(comandas, eq(comandas.ecfDocumentId, ecfDocuments.id))
    .leftJoin(mesas, eq(comandas.mesaId, mesas.id))
    .where(and(...condiciones))
    .orderBy(desc(ecfDocuments.createdAt));

  // Métodos de pago por documento (una consulta para todos los ids del turno).
  const ids = docs.map((d) => d.id);
  const metodosPorDoc = new Map<number, string[]>();
  if (ids.length > 0) {
    const pagos = await db
      .select({ docId: pagosRecibidos.ecfDocumentId, metodo: pagosRecibidos.metodo })
      .from(pagosRecibidos)
      .where(and(eq(pagosRecibidos.teamId, teamId), inArray(pagosRecibidos.ecfDocumentId, ids)));
    for (const p of pagos) {
      if (p.docId == null) continue;
      const arr = metodosPorDoc.get(p.docId) ?? [];
      if (!arr.includes(p.metodo)) arr.push(p.metodo);
      metodosPorDoc.set(p.docId, arr);
    }
  }

  const ventas = docs.map((d) => {
    // Sin pagos registrados = fiado (crédito): el POS registra crédito sin pago.
    const metodos = metodosPorDoc.get(d.id) ?? (d.estado === 'ANULADO' ? [] : ['credito']);
    return {
      id:           d.id,
      codigo:       d.codigo,
      encf:         d.encf,
      tipoEcf:      d.tipoEcf,
      estado:       d.estado,
      estadoPago:   d.estadoPago,
      tipoOrden:    d.tipoOrden,
      montoTotal:   d.montoTotal,
      cliente:      d.cliente || d.dependiente || 'Consumidor Final',
      fechaEmision: d.fechaEmision,
      cajero:       d.cajero ?? d.cajeroEmail ?? null,
      mesa:         d.mesa ?? null,
      metodos,
    };
  });

  // Filtro por método: se aplica sobre el set derivado (incluye 'credito').
  const filtradas = metodoFiltro
    ? ventas.filter((v) => v.metodos.includes(metodoFiltro))
    : ventas;

  return NextResponse.json({ turno: { id: turnoId }, ventas: filtradas, total: filtradas.length });
}
