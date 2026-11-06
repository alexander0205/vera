/**
 * Saldo a favor que genera una Nota de Crédito (tipo 34, modelo nuevo).
 *
 * Se acredita como máximo lo que el cliente PAGÓ de la factura de origen. Sin
 * factura de origen en el sistema (factura externa) no hay con qué capar y se
 * acredita el total de la nota. Toda ruta que cree o emita una NC debe guardar
 * este valor en `credito_generado_cents`; sin él la NC no tiene saldo y no se
 * puede usar como método de pago.
 */
import { eq, sql } from 'drizzle-orm';
import { pagosRecibidos } from '@/lib/db/schema';

/** Pura: `pagadoOrigenCents` null = no hay factura de origen. */
export function calcularCreditoNotaCents(input: {
  montoNcCents: number;
  pagadoOrigenCents: number | null;
}): number {
  const monto = Math.max(0, Math.round(input.montoNcCents));
  if (input.pagadoOrigenCents == null) return monto;
  return Math.min(monto, Math.max(0, Math.round(input.pagadoOrigenCents)));
}

type DbLike = {
  select: (...a: never[]) => unknown;
};

/** Lee lo pagado de la factura de origen AHORA y calcula el crédito. */
export async function creditoNotaCents(
  db: DbLike,
  input: { montoNcCents: number; origenDocumentoId: number | null },
): Promise<number> {
  if (!input.origenDocumentoId) {
    return calcularCreditoNotaCents({ montoNcCents: input.montoNcCents, pagadoOrigenCents: null });
  }
  const [pg] = await (db as unknown as {
    select: (f: unknown) => { from: (t: unknown) => { where: (w: unknown) => Promise<Array<{ pagado: number }>> } };
  })
    .select({ pagado: sql<number>`coalesce(sum(${pagosRecibidos.montoCentavos}), 0)` })
    .from(pagosRecibidos)
    .where(eq(pagosRecibidos.ecfDocumentId, input.origenDocumentoId));
  return calcularCreditoNotaCents({
    montoNcCents: input.montoNcCents,
    pagadoOrigenCents: Number(pg?.pagado ?? 0),
  });
}
