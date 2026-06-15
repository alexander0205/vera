/**
 * Cálculo y persistencia del estado_pago de un ecf_document.
 *
 * Estados:
 *   PENDIENTE  — sin pagos registrados
 *   PARCIAL    — pagos parciales (0 < pagado < total)
 *   PAGADA     — SOLO cuando el pago completa el total (pagado >= total)
 *   ANULADA    — factura anulada (precedencia máxima)
 *   GRATUITA   — tipoPago=3 (sin cobro)
 *   USO        — tipoPago=4 (uso/consumo)
 *
 * Regla: nunca se marca PAGADA al emitir. Solo el ledger pagos_recibidos
 * (vía registrarPago/registrarPagosSplit/syncPagoMirror) puede llevar a PAGADA.
 */

import { and, eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { ecfDocuments, pagosRecibidos } from '@/lib/db/schema';
import { calcularEstadoPago, type EstadoPago } from '@/lib/facturas/estado-pago-calc';

// Re-export para mantener compat con los imports existentes (queries.ts, etc.).
export { calcularEstadoPago, type EstadoPago };

/**
 * Recalcula y persiste el estado_pago de un documento.
 * Lee el total pagado actual desde pagos_recibidos. Idempotente.
 */
export async function recalcularEstadoPago(ecfDocumentId: number): Promise<EstadoPago> {
  const [doc] = await db
    .select({
      estado:     ecfDocuments.estado,
      tipoPago:   ecfDocuments.tipoPago,
      montoTotal: ecfDocuments.montoTotal,
      teamId:     ecfDocuments.teamId,
    })
    .from(ecfDocuments)
    .where(eq(ecfDocuments.id, ecfDocumentId))
    .limit(1);

  if (!doc) throw new Error(`ecf_document ${ecfDocumentId} no encontrado`);

  const [{ total }] = await db
    .select({ total: sql<number>`COALESCE(SUM(${pagosRecibidos.montoCentavos}), 0)` })
    .from(pagosRecibidos)
    .where(and(
      eq(pagosRecibidos.ecfDocumentId, ecfDocumentId),
      eq(pagosRecibidos.teamId, doc.teamId),
    ));

  const nuevo = calcularEstadoPago({
    estado:      doc.estado,
    tipoPago:    doc.tipoPago,
    montoTotal:  doc.montoTotal,
    totalPagado: Number(total ?? 0),
  });

  await db.update(ecfDocuments)
    .set({ estadoPago: nuevo, updatedAt: new Date() })
    .where(eq(ecfDocuments.id, ecfDocumentId));

  return nuevo;
}
