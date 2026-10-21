/**
 * lib/cobranza/recargo.ts — Lógica de recargo por mora automático.
 *
 * ARQUITECTURA (ND de mora):
 * El recargo por mora se materializa como una Nota de Débito tipo 33 en estado
 * BORRADOR interna (ver `generarNotaDebitoMora`), atada a la factura padre vía
 * `moraOrigenId`. NO se envía a la DGII y es EXENTA de ITBIS. Como no se envía a
 * DGII, el padre puede estar en cualquier estado de emisión (borrador, sin-ncf,
 * o e-CF aceptado) — solo se excluyen ANULADO/RECHAZADO.
 *
 * Idempotencia: `generarNotaDebitoMora` valida que no exista ya una ND de mora
 * activa para el padre (reason 'ya_existe'); aquí eso se cuenta como omitido.
 */

import { db } from '@/lib/db/drizzle';
import { teams, ecfDocuments } from '@/lib/db/schema';
import { and, eq, sql } from 'drizzle-orm';
import { generarNotaDebitoMora } from '@/lib/cobranza/nota-debito-mora';
import { hoyRD } from '@/lib/utils/format';

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
  aplicados:  number;  // notas de débito de mora nuevas generadas
  omitidos:   number;  // ya tenían ND de mora (idempotencia) o sin saldo / error
  montoTotalCentavos: number;
  detalles: RecargoDetalle[];
}

/**
 * Genera notas de débito por mora a todas las facturas vencidas que cumplan:
 * - tipoPago = 2 (crédito)
 * - fechaLimitePago < hoy y saldo > 0
 * - moraOrigenId IS NULL (no procesar las propias ND de mora)
 * - estado NOT IN ('ANULADO', 'RECHAZADO')  ← incluye borradores/sin-ncf
 * - diasVencido >= recargoMoraDiasGracia del team
 * - SIN ND de mora previa activa (idempotencia vía generarNotaDebitoMora)
 */
export async function aplicarRecargosMoraVencidos(
  opts: AplicarRecargoOpts = {},
): Promise<AplicarRecargoResult> {
  const hoy = hoyRD();

  // Obtener teams candidatos (solo activos — el cron no debe procesar inactivos)
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
    // Traer facturas vencidas del team con saldo > 0 elegibles para ND de mora.
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
      })
      .from(ecfDocuments)
      .where(and(
        eq(ecfDocuments.teamId, equipo.id),
        eq(ecfDocuments.tipoPago, 2),
        // No procesar las propias ND de mora (no mora sobre mora)
        sql`${ecfDocuments.moraOrigenId} IS NULL`,
        // Incluye borradores/sin-ncf: solo se excluyen no-cobrables
        sql`${ecfDocuments.estado} NOT IN ('ANULADO', 'RECHAZADO')`,
        // Vencida: tiene fecha límite y ya pasó
        sql`${ecfDocuments.fechaLimitePago} IS NOT NULL`,
        sql`${ecfDocuments.fechaLimitePago} < ${hoy}`,
        // Respetar el "Cobrar recargo por mora" del concepto escolar. El motor
        // de mora corre a nivel factura y solo miraba el interruptor del team
        // (recargoMoraActivo), ignorando que cada concepto escolar tiene su
        // propio `cobra_mora`. Resultado en prod (Mi Casita): las facturas de
        // "Evaluación" (cobra_mora=false) recibían mora porque el team tenía la
        // mora global activa por las colegiaturas.
        //
        // Regla: si la factura está respaldada SOLO por cargos escolares cuyo
        // concepto NO cobra mora, se excluye. Una factura sin cargo escolar
        // (venta normal) o con al menos un cargo cuyo concepto SÍ cobra mora
        // sigue siendo elegible — no se toca la cobranza regular ni la mixta.
        // OJO: `ecf_documents.id` va LITERAL, no `${ecfDocuments.id}`. Drizzle
        // renderiza esa interpolación sin calificar ("id") dentro de un sql
        // anidado, y como admin_escolar_cargos también tiene `id` la correlación
        // casaría con la tabla interna. El subquery de `pagado` de arriba usa el
        // mismo literal por la misma razón.
        // El `aec.team_id = ecf_documents.team_id` no cambia el resultado (la
        // factura y sus cargos son del mismo team), pero deja que Postgres use
        // el índice admin_escolar_cargos_team_factura_idx (team_id, ecf_document_id).
        sql`NOT (
          EXISTS (
            SELECT 1 FROM admin_escolar_cargos aec
            WHERE aec.ecf_document_id = ecf_documents.id
              AND aec.team_id = ecf_documents.team_id
          )
          AND NOT EXISTS (
            SELECT 1 FROM admin_escolar_cargos aec
            JOIN admin_escolar_conceptos_pago cp ON cp.id = aec.concepto_id
            WHERE aec.ecf_document_id = ecf_documents.id
              AND aec.team_id = ecf_documents.team_id
              AND cp.cobra_mora = true
          )
        )`,
      ));

    for (const factura of facturas) {
      const pagado = Number(factura.pagado);
      const saldo  = factura.montoTotal - pagado;

      // Descarte barato antes de ir a la DB: sin saldo no hay nada que recargar.
      // El resto de la elegibilidad (gracia, períodos ya cobrados, topes) la
      // decide `calcularMora` dentro del generador — antes estaba duplicada
      // aquí y las dos copias podían divergir.
      if (saldo <= 0) continue;

      const diasVencido = factura.fechaLimitePago
        ? Math.floor(
            (new Date(hoy).getTime() - new Date(factura.fechaLimitePago).getTime()) / 86400000,
          )
        : 0;

      result.procesados++;

      const res = await generarNotaDebitoMora(factura.id, { origen: 'cron' });

      if (res.ok) {
        result.aplicados++;
        result.montoTotalCentavos += res.montoCentavos;
        result.detalles.push({
          ecfDocumentId: factura.id,
          encf:          factura.encf,
          teamId:        equipo.id,
          montoCentavos: res.montoCentavos,
          diasVencido,
        });
      } else {
        // 'ya_existe' / 'sin_saldo' / 'mora_cero' / etc. → omitido
        result.omitidos++;
      }
    }
  }

  return result;
}
