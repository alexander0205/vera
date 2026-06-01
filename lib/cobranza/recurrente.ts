/**
 * lib/cobranza/recurrente.ts — Lógica de generación de factura desde recurrente.
 *
 * Función reutilizable usada tanto por el cron diario como por el endpoint
 * "Generar ahora" (disparo manual para pruebas).
 */

import { db } from '@/lib/db/drizzle';
import { facturasRecurrentes, sequences, ecfDocuments } from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';
import { calcularTotales } from '@/lib/ecf/types';

export interface GenerarFacturaResult {
  ok: true;
  documentoId: number;
  encf: string;
}

export type GenerarFacturaError =
  | { ok: false; reason: 'no_sequence' }
  | { ok: false; reason: 'not_found' }
  | { ok: false; reason: string };

/**
 * Genera una factura borrador a partir de una recurrente.
 *
 * - Copia ítems (lineasJson) y recalcula totales.
 * - Marca origenRecurrenteId para que AR la incluya.
 * - Avanza la secuencia + proximaEmision + facturasEmitidas.
 * - ignoreDate=true (para "Generar ahora"): genera aunque proximaEmision sea futura.
 */
export async function generarFacturaDeRecurrente(
  fr: {
    id: number;
    teamId: number;
    clientId: number | null;
    tipoEcf: string;
    tipoPago: number;
    diasParaPago: number | null;
    frecuencia: string;
    diaCobro: number | null;
    fechaFin: string | null;
    proximaEmision: string;
    items: string;
    totalEstimado: number;
    notas: string | null;
    nombre: string;
    facturasEmitidas: number;
  },
): Promise<GenerarFacturaResult | GenerarFacturaError> {
  // Obtener secuencia disponible
  const seq = await db
    .select()
    .from(sequences)
    .where(
      and(
        eq(sequences.teamId, fr.teamId),
        eq(sequences.tipoEcf, fr.tipoEcf),
      ),
    )
    .limit(1);

  if (!seq[0] || seq[0].secuenciaActual > seq[0].secuenciaHasta) {
    return { ok: false, reason: 'no_sequence' };
  }

  // Parsear ítems y calcular totales
  let montoTotal = fr.totalEstimado;
  let totalItbis = 0;
  let lineasJson: string = fr.items;

  try {
    const items = JSON.parse(fr.items);
    if (Array.isArray(items) && items.length > 0) {
      const totales = calcularTotales(items);
      montoTotal = Math.round(totales.montoTotal);
      totalItbis = Math.round(totales.totalItbis);
    }
  } catch {
    // fallback a totalEstimado si el JSON es inválido
  }

  // Construir e-NCF
  const encf = `E${fr.tipoEcf}${String(seq[0].secuenciaActual).padStart(10, '0')}`;

  // Fecha límite de pago para crédito
  let fechaLimitePago: string | null = null;
  if (fr.tipoPago === 2 && fr.diasParaPago && fr.diasParaPago > 0) {
    const limite = new Date();
    limite.setDate(limite.getDate() + fr.diasParaPago);
    fechaLimitePago = limite.toISOString().slice(0, 10);
  }

  // Insertar documento
  const [inserted] = await db
    .insert(ecfDocuments)
    .values({
      teamId: fr.teamId,
      clientId: fr.clientId,
      encf,
      tipoEcf: fr.tipoEcf,
      estado: 'BORRADOR',
      tipoPago: fr.tipoPago,
      fechaLimitePago,
      montoTotal,
      totalItbis,
      lineasJson,
      notas: fr.notas ?? `Factura recurrente: ${fr.nombre}`,
      origenRecurrenteId: fr.id,
    })
    .returning({ id: ecfDocuments.id });

  // Avanzar secuencia
  await db
    .update(sequences)
    .set({ secuenciaActual: seq[0].secuenciaActual + BigInt(1), updatedAt: new Date() })
    .where(eq(sequences.id, seq[0].id));

  // Calcular próxima emisión
  const [py, pm, pd] = fr.proximaEmision.split('-').map(Number);
  const nextDate = new Date(py, pm - 1, pd);

  if (fr.frecuencia === 'semanal') {
    nextDate.setDate(nextDate.getDate() + 7);
  } else if (fr.frecuencia === 'quincenal') {
    nextDate.setDate(nextDate.getDate() + 15);
  } else {
    const monthOffset =
      fr.frecuencia === 'mensual'    ? 1  :
      fr.frecuencia === 'trimestral' ? 3  :
      fr.frecuencia === 'anual'      ? 12 : 1;

    const targetMonth    = nextDate.getMonth() + monthOffset;
    const targetYear     = nextDate.getFullYear() + Math.floor(targetMonth / 12);
    const normalizedMonth = ((targetMonth % 12) + 12) % 12;
    const lastDayTarget  = new Date(targetYear, normalizedMonth + 1, 0).getDate();
    const desiredDay     = fr.diaCobro ?? nextDate.getDate();
    const clampedDay     = Math.min(desiredDay, lastDayTarget);
    nextDate.setFullYear(targetYear, normalizedMonth, clampedDay);
  }

  const nextStr =
    `${nextDate.getFullYear()}-` +
    `${String(nextDate.getMonth() + 1).padStart(2, '0')}-` +
    `${String(nextDate.getDate()).padStart(2, '0')}`;

  const pastEnd = fr.fechaFin && nextStr > fr.fechaFin;

  await db
    .update(facturasRecurrentes)
    .set({
      proximaEmision:   nextStr,
      facturasEmitidas: fr.facturasEmitidas + 1,
      estado:           pastEnd ? 'finalizada' : 'activa',
      updatedAt:        new Date(),
    })
    .where(eq(facturasRecurrentes.id, fr.id));

  return { ok: true, documentoId: inserted.id, encf };
}
