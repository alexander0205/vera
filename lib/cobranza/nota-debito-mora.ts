/**
 * lib/cobranza/nota-debito-mora.ts — Genera una Nota de Débito (tipo 33) por mora.
 *
 * ARQUITECTURA: el recargo por mora ya NO se guarda como dato oculto en
 * `recargos_mora`. En su lugar se crea una ND tipo 33 en estado BORRADOR,
 * atada a la factura padre vía `moraOrigenId`. Esta ND:
 *   - NO se envía a la DGII (es interna; el padre puede ser borrador/sin-ncf).
 *   - Es EXENTA de ITBIS (la mora no causa impuesto).
 *   - Aparece como su propia fila en cuentas por cobrar (tiene saldo propio).
 *
 * Se genera automáticamente vía cron (al vencer + gracia) o manualmente desde
 * el detalle de la factura.
 */

import { db } from '@/lib/db/drizzle';
import { teams, ecfDocuments, pagosRecibidos } from '@/lib/db/schema';
import { and, eq, ne, sql } from 'drizzle-orm';
import { generarCodigoFactura } from '@/lib/facturas/codigo';
import { calcularEstadoPago } from '@/lib/facturas/estado-pago';

export type GenerarNotaDebitoMoraResult =
  | { ok: true; notaDebitoId: number; montoCentavos: number }
  | { ok: false; reason: 'not_found' | 'es_nota_mora' | 'anulada' | 'sin_saldo' | 'ya_existe' | 'mora_cero' };

export async function generarNotaDebitoMora(
  ecfDocumentId: number,
  opts: { createdBy?: number } = {},
): Promise<GenerarNotaDebitoMoraResult> {
  // ── Cargar la factura padre ────────────────────────────────────────────────
  const [padre] = await db
    .select({
      id:                   ecfDocuments.id,
      teamId:               ecfDocuments.teamId,
      clientId:             ecfDocuments.clientId,
      encf:                 ecfDocuments.encf,
      codigo:               ecfDocuments.codigo,
      montoTotal:           ecfDocuments.montoTotal,
      estado:               ecfDocuments.estado,
      rncComprador:         ecfDocuments.rncComprador,
      razonSocialComprador: ecfDocuments.razonSocialComprador,
      moraOrigenId:         ecfDocuments.moraOrigenId,
      tipoEcf:              ecfDocuments.tipoEcf,
      // Override por factura — % de mora en bps (null = usar default del team).
      moraPorcentaje:       ecfDocuments.moraPorcentaje,
    })
    .from(ecfDocuments)
    .where(eq(ecfDocuments.id, ecfDocumentId))
    .limit(1);

  if (!padre) return { ok: false, reason: 'not_found' };

  // No mora sobre mora: si el padre YA es una ND de mora, abortar.
  if (padre.moraOrigenId != null) return { ok: false, reason: 'es_nota_mora' };

  if (padre.estado === 'ANULADO') return { ok: false, reason: 'anulada' };

  // ── % del team ─────────────────────────────────────────────────────────────
  // recargoMoraActivo no se valida aquí: la generación manual debe funcionar
  // aunque esté desactivado. El cron solo procesa teams activos por su cuenta.
  const [team] = await db
    .select({ recargoMoraPorcentaje: teams.recargoMoraPorcentaje })
    .from(teams)
    .where(eq(teams.id, padre.teamId))
    .limit(1);

  // El override por factura tiene prioridad; fallback al default del team.
  const pct = padre.moraPorcentaje ?? team?.recargoMoraPorcentaje ?? 0;

  // ── Saldo del padre = montoTotal − SUM(pagos) ──────────────────────────────
  const [{ pagado }] = await db
    .select({
      pagado: sql<number>`coalesce(sum(${pagosRecibidos.montoCentavos}), 0)`,
    })
    .from(pagosRecibidos)
    .where(and(
      eq(pagosRecibidos.ecfDocumentId, padre.id),
      eq(pagosRecibidos.teamId, padre.teamId),
    ));

  const saldoPadre = padre.montoTotal - Number(pagado ?? 0);
  if (saldoPadre <= 0) return { ok: false, reason: 'sin_saldo' };

  // ── Idempotencia: ¿ya existe una ND de mora activa para este padre? ────────
  const [{ existentes }] = await db
    .select({ existentes: sql<number>`count(*)` })
    .from(ecfDocuments)
    .where(and(
      eq(ecfDocuments.moraOrigenId, padre.id),
      ne(ecfDocuments.estado, 'ANULADO'),
    ));

  if (Number(existentes) > 0) return { ok: false, reason: 'ya_existe' };

  // ── Monto de la mora ───────────────────────────────────────────────────────
  const montoMora = Math.round((saldoPadre * pct) / 10000);
  if (montoMora <= 0) return { ok: false, reason: 'mora_cero' };

  // ── Insertar la ND tipo 33 (BORRADOR, exenta de ITBIS) ─────────────────────
  const codigo = await generarCodigoFactura(db, { teamId: padre.teamId, userId: opts?.createdBy ?? null, tipoEcf: '33' });
  const encf = `BOR-33-${Date.now().toString(36).toUpperCase().slice(-8)}`;
  const estadoPago = calcularEstadoPago({
    estado:      'BORRADOR',
    tipoPago:    2,
    montoTotal:  montoMora,
    totalPagado: 0,
  });

  const [nd] = await db
    .insert(ecfDocuments)
    .values({
      teamId:               padre.teamId,
      clientId:             padre.clientId,
      rncComprador:         padre.rncComprador,
      razonSocialComprador: padre.razonSocialComprador,
      tipoEcf:              '33',
      estado:               'BORRADOR',
      encf,
      codigo,
      montoTotal:           montoMora,
      totalItbis:           0,            // EXENTA
      tipoPago:             2,            // crédito (por cobrar)
      estadoPago,
      fechaEmision:         new Date(),
      // Referencia fiscal solo si el padre tiene un e-NCF real (empieza con 'E').
      ncfModificado:        padre.encf.startsWith('E') ? padre.encf : null,
      moraOrigenId:         padre.id,
      notas:                `Nota de débito por mora — ${padre.codigo ?? padre.encf}`,
      lineasJson:           JSON.stringify([{
        nombreItem:              'Interés por mora',
        cantidadItem:            1,
        precioUnitarioItem:      montoMora / 100,
        tasaItbis:               'exento',
        indicadorBienoServicio:  '2',
      }]),
      createdBy:            opts.createdBy ?? null,
    })
    .returning({ id: ecfDocuments.id });

  return { ok: true, notaDebitoId: nd.id, montoCentavos: montoMora };
}
