/**
 * lib/cobranza/recargo.ts — Lógica de recargo por mora automático.
 *
 * ARQUITECTURA OPCIÓN A:
 * El recargo es un dato EXCLUSIVO de cobranza. NO se modifica el e-CF emitido
 * (xmlFirmado, montoTotal, lineasJson) porque las facturas ACEPTADAS / firmadas
 * en DGII son inmutables: alterarlas rompería la integridad fiscal y la
 * urlVerificacion DGII. El recargo se registra en `recargos_mora` y se suma
 * al saldo en la vista de cuentas por cobrar y tickets de cobranza.
 *
 * Idempotencia: el UNIQUE constraint en recargos_mora(ecf_document_id) impide
 * doble aplicación. Si el cron corre varias veces, la excepción de duplicado
 * es capturada y la fila es omitida silenciosamente.
 */

import { db } from '@/lib/db/drizzle';
import { teams, ecfDocuments, recargosMora } from '@/lib/db/schema';
import { and, eq, sql } from 'drizzle-orm';

export interface AplicarRecargoOpts {
  /** Si se especifica, solo aplica para ese team. Si no, aplica a TODOS los teams con recargoMoraActivo=true. */
  teamId?: number;
}

export interface RecargoDetalle {
  ecfDocumentId: number;
  encf:          string;
  teamId:        number;
  montoCentavos: number;
  diasVencido:   number;
}

export interface AplicarRecargoResult {
  procesados: number;  // facturas evaluadas (vencidas con días >= gracia)
  aplicados:  number;  // recargos nuevos insertados
  omitidos:   number;  // ya tenían recargo (idempotencia) o error
  montoTotalCentavos: number;
  detalles: RecargoDetalle[];
}

/**
 * Aplica recargos por mora a todas las facturas vencidas que cumplan:
 * - tipoPago = 2 (crédito)
 * - estado IN ('ACEPTADO', 'ACEPTADO_CONDICIONAL', 'EN_PROCESO', 'HISTORICA')
 * - saldo > 0
 * - diasVencido >= recargoMoraDiasGracia del team
 * - SIN recargo previo (UNIQUE constraint como seguro de idempotencia)
 */
export async function aplicarRecargosMoraVencidos(
  opts: AplicarRecargoOpts = {},
): Promise<AplicarRecargoResult> {
  const hoy = new Date().toISOString().slice(0, 10);

  // Obtener teams candidatos
  const teamsQuery = db
    .select({
      id:                   teams.id,
      recargoMoraPorcentaje: teams.recargoMoraPorcentaje,
      recargoMoraDiasGracia: teams.recargoMoraDiasGracia,
    })
    .from(teams)
    .where(
      opts.teamId !== undefined
        ? and(eq(teams.recargoMoraActivo, true), eq(teams.id, opts.teamId))
        : eq(teams.recargoMoraActivo, true),
    );

  const equipos = await teamsQuery;

  const result: AplicarRecargoResult = {
    procesados: 0,
    aplicados:  0,
    omitidos:   0,
    montoTotalCentavos: 0,
    detalles: [],
  };

  for (const equipo of equipos) {
    // Traer facturas vencidas del team con saldo > 0 y sin recargo previo
    const facturas = await db
      .select({
        id:              ecfDocuments.id,
        encf:            ecfDocuments.encf,
        montoTotal:      ecfDocuments.montoTotal,
        fechaLimitePago: ecfDocuments.fechaLimitePago,
        // Saldo = montoTotal - pagos recibidos
        pagado: sql<number>`coalesce((
          SELECT SUM(monto_centavos) FROM pagos_recibidos
          WHERE pagos_recibidos.ecf_document_id = ecf_documents.id
        ), 0)`,
        // Verificar si YA existe recargo
        tieneRecargo: sql<number>`(
          SELECT COUNT(*) FROM recargos_mora
          WHERE recargos_mora.ecf_document_id = ecf_documents.id
        )`,
      })
      .from(ecfDocuments)
      .where(and(
        eq(ecfDocuments.teamId, equipo.id),
        eq(ecfDocuments.tipoPago, 2),
        sql`${ecfDocuments.estado} IN ('ACEPTADO', 'ACEPTADO_CONDICIONAL', 'EN_PROCESO', 'HISTORICA')`,
        // Vencida: tiene fecha límite y ya pasó
        sql`${ecfDocuments.fechaLimitePago} IS NOT NULL`,
        sql`${ecfDocuments.fechaLimitePago} < ${hoy}`,
      ));

    for (const factura of facturas) {
      const pagado  = Number(factura.pagado);
      const saldo   = factura.montoTotal - pagado;

      // Solo si saldo > 0 (aún sin pagar)
      if (saldo <= 0) continue;

      // Calcular días vencido
      const diasVencido = factura.fechaLimitePago
        ? Math.floor(
            (new Date(hoy).getTime() - new Date(factura.fechaLimitePago).getTime()) / 86400000,
          )
        : 0;

      // Aplicar solo si supera el período de gracia
      if (diasVencido < equipo.recargoMoraDiasGracia) continue;

      // Ya tiene recargo → saltar (la UNIQUE también lo bloquearía, pero evitamos el try/catch)
      if (Number(factura.tieneRecargo) > 0) {
        result.omitidos++;
        continue;
      }

      result.procesados++;

      // monto = round(saldo * pct_bps / 10000)
      const montoCentavos = Math.round((saldo * equipo.recargoMoraPorcentaje) / 10000);

      try {
        await db.insert(recargosMora).values({
          teamId:               equipo.id,
          ecfDocumentId:        factura.id,
          montoCentavos,
          porcentajeAplicado:   equipo.recargoMoraPorcentaje,
          diasGraciaAplicados:  equipo.recargoMoraDiasGracia,
          baseSaldoCentavos:    saldo,
          diasVencidoAlAplicar: diasVencido,
          createdBy:            null, // null = sistema/cron
        });

        result.aplicados++;
        result.montoTotalCentavos += montoCentavos;
        result.detalles.push({
          ecfDocumentId: factura.id,
          encf:          factura.encf,
          teamId:        equipo.id,
          montoCentavos,
          diasVencido,
        });
      } catch (err: unknown) {
        // Captura violación UNIQUE (ya existe recargo) y otros errores — continúa
        const msg = err instanceof Error ? err.message : String(err);
        if (!msg.includes('unique') && !msg.includes('duplicate')) {
          // Error inesperado — loguear pero no abortar el lote
          console.error('[recargo-mora] Error insertando recargo para doc', factura.id, msg);
        }
        result.omitidos++;
      }
    }
  }

  return result;
}
