/**
 * POST /api/pos/venta/[id]/anular — anula (o reabre) un recibo cobrado del POS.
 * Fase 2 del historial de recibos. Gate: pos:anular (owner/admin).
 *
 * Body: { modo: 'eliminar' | 'unsettle' }
 *   - eliminar → la venta queda ANULADA en el historial (no se borra la fila).
 *   - unsettle → NO anula: solo revierte el cobro y deja el recibo como NO PAGADO
 *     (estadoPago = PENDIENTE). El documento y su inventario quedan intactos; solo
 *     deja de contar como pagado. No abre el editor ni reabre comandas.
 *
 * Anular una venta interna (sin-ncf / borrador / rechazado) se hace en-app:
 * marca ANULADO, revierte los pagos (→ la reversa de caja es automática porque
 * el cuadre excluye documentos ANULADOS) y restaura el inventario.
 *
 * Un e-CF fiscal YA ACEPTADO por la DGII NO se anula aquí: la anulación formal
 * exige una Nota de Crédito (tipo 34). Se responde requiereNotaCredito + la URL
 * del formulario de NC pre-enlazado, SIN mutar el documento.
 */

import { NextRequest, NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { requirePermission } from '@/lib/auth/api-guard';
import { logAudit, getIp } from '@/lib/audit';
import { db } from '@/lib/db/drizzle';
import { ecfDocuments, pagosRecibidos } from '@/lib/db/schema';
import { restaurarInventario } from '@/lib/inventario/devolucion';

// Estados que ya pasaron por la DGII y fueron aceptados: la reversa fiscal es
// una Nota de Crédito, no una anulación local.
const REQUIERE_NOTA_CREDITO = ['ACEPTADO', 'ACEPTADO_CONDICIONAL'];

const schema = z.object({ modo: z.enum(['eliminar', 'unsettle']) });

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermission('pos:anular');
  if (!auth.ok) return auth.response;
  const { teamId, user } = auth;

  const id = Number((await params).id);
  if (!Number.isInteger(id)) return NextResponse.json({ error: 'ID inválido' }, { status: 400 });

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 });
  const { modo } = parsed.data;

  const [doc] = await db
    .select({
      id:              ecfDocuments.id,
      estado:          ecfDocuments.estado,
      encf:            ecfDocuments.encf,
      tipoEcf:         ecfDocuments.tipoEcf,
      lineasJson:      ecfDocuments.lineasJson,
      almacenId:       ecfDocuments.almacenId,
      stockDescontado: ecfDocuments.stockDescontado,
      pagoRecibido:    ecfDocuments.pagoRecibido,
      turnoCajaId:     ecfDocuments.turnoCajaId,
    })
    .from(ecfDocuments)
    .where(and(eq(ecfDocuments.id, id), eq(ecfDocuments.teamId, teamId)))
    .limit(1);

  if (!doc) return NextResponse.json({ error: 'Venta no encontrada' }, { status: 404 });

  // Guardarraíl: este endpoint es del POS. Una factura que nunca pasó por una
  // caja no se anula desde aquí (se hace desde Facturación con facturas:anular).
  if (doc.turnoCajaId == null) {
    return NextResponse.json({ error: 'Esta venta no es del POS; anúlala desde Facturación.' }, { status: 422 });
  }

  if (doc.estado === 'ANULADO') {
    return NextResponse.json({ error: 'El recibo ya está anulado' }, { status: 409 });
  }
  // Enviado a la DGII y esperando respuesta: no se anula en vuelo (espera el ACEPTADO
  // para reversar con Nota de Crédito, o el RECHAZADO para anular en local).
  if (doc.estado === 'EN_PROCESO') {
    return NextResponse.json({ error: 'Comprobante en proceso en la DGII; espera la respuesta.' }, { status: 409 });
  }

  // e-CF fiscal aceptado → handoff a la Nota de Crédito (no se muta nada).
  if (REQUIERE_NOTA_CREDITO.includes(doc.estado)) {
    return NextResponse.json({
      requiereNotaCredito: true,
      redirectTo: `/dashboard/notas-credito/nueva?padreId=${doc.id}`,
      mensaje: 'Este comprobante fue aceptado por la DGII. Su reversa formal es una Nota de Crédito (tipo 34).',
    });
  }

  // ── Unsettle: dejar el recibo como NO PAGADO, sin anular ───────────────────
  // Revierte solo el cobro (borra pagos_recibidos → la caja reconcilia sola) y
  // marca estadoPago = PENDIENTE. El documento y su inventario NO se tocan: la
  // venta sigue válida, solo deja de contar como pagada.
  if (modo === 'unsettle') {
    await db.delete(pagosRecibidos).where(eq(pagosRecibidos.ecfDocumentId, id));
    await db.update(ecfDocuments).set({
      estadoPago: 'PENDIENTE',
      pagoRecibido: 'false',
      updatedBy: user.id,
      updatedAt: new Date(),
    }).where(eq(ecfDocuments.id, id));

    logAudit({
      teamId, userId: user.id, actor: user.email,
      action: 'POS_VENTA_UNSETTLE', resource: `ecf:${id}`, ip: getIp(req),
      meta: { encf: doc.encf, modo },
    });
    return NextResponse.json({ ok: true, estadoPago: 'PENDIENTE', modo });
  }

  // ── Anulación interna (sin-ncf / borrador / rechazado) ─────────────────────
  // Revertir pagos: borrar las filas de pagos_recibidos. El cuadre de caja
  // excluye ANULADOS, así que el efectivo esperado del turno se ajusta solo.
  await db.delete(pagosRecibidos).where(eq(pagosRecibidos.ecfDocumentId, id));

  await db.update(ecfDocuments).set({
    estado:          'ANULADO',
    estadoPago:      'ANULADA',
    tipoAnulacion:   '04',   // cesación de operaciones (default DGII)
    stockDescontado: false,
    updatedBy:       user.id,
    updatedAt:       new Date(),
  }).where(eq(ecfDocuments.id, id));

  // Restaurar inventario solo si este documento llegó a descontarlo.
  if (doc.stockDescontado && doc.lineasJson) {
    try {
      const lineas = JSON.parse(doc.lineasJson) as Array<Record<string, unknown>>;
      const items = lineas.map((i) => ({
        productoId:             i.productoId ? Number(i.productoId) : null,
        cantidadItem:           i.cantidadItem ? Number(i.cantidadItem) : 1,
        indicadorBienoServicio: (i.indicadorBienoServicio === 1 || i.indicadorBienoServicio === '1' ? 1 : 2) as 1 | 2,
      }));
      restaurarInventario(teamId, user.id, id, doc.encf, items, doc.almacenId ?? null)
        .catch((e) => console.error('[pos/anular] restaurar stock falló', e));
    } catch {
      // lineasJson malformado — no bloquear la anulación.
    }
  }

  logAudit({
    teamId, userId: user.id, actor: user.email,
    action: 'POS_VENTA_ELIMINAR',
    resource: `ecf:${id}`, ip: getIp(req),
    meta: { encf: doc.encf, modo },
  });

  return NextResponse.json({ ok: true, estado: 'ANULADO', modo });
}
