/**
 * Qué le hace al inventario cada tipo de comprobante al emitirse (ver `movimientoDeStock`):
 *   31, 32, 44, 45, 46, sin-ncf  descuentan (son ventas)
 *   41 compra, 43/47 gasto        nada (no son ventas; la compra entra por Compras)
 *   33 nota de débito             nada
 *   34 nota de crédito            nada, o devuelve si «el cliente devolvió la mercancía»
 *
 * Notas de crédito y débito:
 *
 *  - Una nota NUNCA descuenta stock (antes, emitirla con productos lo bajaba).
 *  - Nota de débito (33): no mueve nada.
 *  - Nota de crédito (34): solo mueve si se marcó «¿El cliente devolvió la
 *    mercancía?». Entonces el stock vuelve y el costo de ventas se revierte con
 *    el costo con que salió la venta ORIGINAL (la factura que la nota modifica).
 */

import { db } from '@/lib/db/drizzle';
import { and, eq, sql } from 'drizzle-orm';
import { ecfDocuments } from '@/lib/db/schema';
import { restaurarInventario, type ItemParaDevolucion } from './devolucion';

export type MovimientoDeStock = 'descontar' | 'devolver' | 'ninguno';

/** Qué le hace al stock emitir un documento de este tipo. */
export function movimientoDeStock(tipoEcf: string, devuelveMercancia: boolean | null | undefined): MovimientoDeStock {
  // 41 compra y 43/47 gastos: salida de dinero, nunca una venta. Antes la compra (41) BAJABA el
  // stock; ninguna ruta de emisión sube stock por ella (eso lo hace Compras con registrarEntradas).
  if (tipoEcf === '41' || tipoEcf === '43' || tipoEcf === '47') return 'ninguno';
  if (tipoEcf === '33') return 'ninguno';
  if (tipoEcf === '34') return devuelveMercancia ? 'devolver' : 'ninguno';
  return 'descontar';
}

/**
 * Devuelve la mercancía de una nota de crédito al inventario. Idempotente: si ya
 * hay una devolución de ESTA nota sobre la factura, no hace nada.
 *
 * El movimiento queda referenciado a la factura original (`referencia_id`) y
 * lleva el e-NCF de la nota en `referencia_encf`: así la devolución encuentra el
 * costo de la venta y el asiento de costos la revierte contra esa venta. Si la
 * factura no está en el sistema, queda referenciado a la propia nota (se mueve
 * el stock; sin venta valorada no hay costo que revertir).
 */
export async function devolverMercanciaDeNota(p: {
  teamId: number;
  userId: number;
  notaId: number;
  notaEncf: string;
  padreId: number | null;
  items: ItemParaDevolucion[];
  almacenId?: number | null;
}): Promise<{ devuelto: boolean }> {
  const referencia = p.padreId ?? p.notaId;

  const ya = await db.execute(sql`
    SELECT 1 AS ok FROM inventory_movements
    WHERE team_id = ${p.teamId} AND referencia_id = ${referencia}
      AND referencia_encf = ${p.notaEncf} AND tipo = 'DEVOLUCION'
    LIMIT 1`) as unknown as { ok: number }[];
  if (ya.length > 0) return { devuelto: false };

  let almacenId = p.almacenId ?? null;
  if (!almacenId && p.padreId) {
    const [padre] = await db.select({ almacenId: ecfDocuments.almacenId }).from(ecfDocuments)
      .where(and(eq(ecfDocuments.id, p.padreId), eq(ecfDocuments.teamId, p.teamId))).limit(1);
    almacenId = padre?.almacenId ?? null;
  }

  await restaurarInventario(p.teamId, p.userId, referencia, p.notaEncf, p.items, almacenId);
  return { devuelto: true };
}
