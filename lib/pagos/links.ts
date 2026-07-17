/**
 * Lógica compartida de links de pago (independiente de la pasarela).
 *
 * Garantía "nunca se pierde nada":
 *   - Un link solo se marca `pagado` tras verificación server-side del resultado.
 *   - marcarLinkPagado() es IDEMPOTENTE: bloquea la fila (FOR UPDATE), y si el
 *     link ya está pagado (o ya tiene pago_recibido_id) NO vuelve a registrar.
 *     Callbacks duplicados / reintentos / doble-click nunca duplican el cobro.
 *   - El pago del e-CF se persiste con registrarPago (mismo ledger que un cobro
 *     manual): entra a pagos_recibidos y recalcula estado_pago.
 *   - Para cotizaciones NO auto-emitimos e-CF (una falla en DGII perdería el
 *     registro del cobro): se marca la cotización pagada y se guarda la
 *     referencia; el e-CF se emite luego como paso confirmado.
 */

import { randomBytes } from 'crypto';
import { and, eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { paymentLinks, pagosRecibidos, cotizaciones } from '@/lib/db/schema';
import { registrarPago } from '@/lib/db/queries';
import { logError, logInfo } from '@/lib/logger';

export type PaymentLinkRow = typeof paymentLinks.$inferSelect;

/** Token público url-safe (para pay.zero.com.do/{token}). */
export function generarToken(): string {
  return randomBytes(16).toString('hex'); // 32 chars, cabe en varchar(40)
}

/** OrdenId corto y único para la pasarela (idempotencia). */
export function generarOrdenId(): string {
  return 'ZP' + randomBytes(6).toString('hex').toUpperCase(); // 14 chars
}

export interface CrearLinkInput {
  teamId:        number;
  provider:      string;
  ecfDocumentId?: number | null;
  cotizacionId?:  number | null;
  montoCentavos: number;
  itbisCentavos?: number;
  createdBy?:    number | null;
  /** Horas de validez del link (default 24). */
  expiraHoras?:  number;
}

/** Crea un link de pago 'pendiente'. Exactamente uno de e-CF / cotización. */
export async function crearPaymentLink(input: CrearLinkInput): Promise<PaymentLinkRow> {
  if (!!input.ecfDocumentId === !!input.cotizacionId) {
    throw new Error('crearPaymentLink: pasar exactamente uno de ecfDocumentId | cotizacionId');
  }
  if (input.montoCentavos <= 0) throw new Error('crearPaymentLink: monto debe ser > 0');

  const horas = input.expiraHoras ?? 24;
  const expiresAt = new Date(Date.now() + horas * 3600_000);

  const [row] = await db.insert(paymentLinks).values({
    token:         generarToken(),
    teamId:        input.teamId,
    provider:      input.provider,
    ecfDocumentId: input.ecfDocumentId ?? null,
    cotizacionId:  input.cotizacionId ?? null,
    montoCentavos: input.montoCentavos,
    itbisCentavos: input.itbisCentavos ?? 0,
    ordenId:       generarOrdenId(),
    estado:        'pendiente',
    expiresAt,
    createdBy:     input.createdBy ?? null,
  }).returning();

  return row;
}

export async function getLinkByToken(token: string): Promise<PaymentLinkRow | null> {
  const [row] = await db.select().from(paymentLinks).where(eq(paymentLinks.token, token)).limit(1);
  return row ?? null;
}

/** Guarda la sesión de la pasarela en el link (SESSION + session-key). */
export async function guardarSesion(linkId: number, sessionId: string, sessionKey: string) {
  await db.update(paymentLinks)
    .set({ sessionId, sessionKey, estado: 'procesando', updatedAt: new Date() })
    .where(eq(paymentLinks.id, linkId));
}

export interface ResultadoPago {
  aprobado:      boolean;
  providerRef?:  string | null;
  cardMask?:     string | null;
}

export interface MarcarPagadoResult {
  estado:        'pagado' | 'fallido' | 'ya_pagado';
  pagoRecibidoId?: number | null;
}

/**
 * Marca el resultado del pago de forma IDEMPOTENTE y sin pérdida. Fuente de
 * verdad única del cobro. Diseñado para que un pago aprobado en la pasarela
 * JAMÁS se pierda, aunque el registro contable falle o el callback se repita.
 *
 * Fase A (tx, lock de fila): decide y persiste el estado. Si el link ya está
 *   pagado → no-op. Si declinado → 'fallido'. Si aprobado → 'pagado' + guarda
 *   providerRef/cardMask/paidAt. Esto queda commiteado ANTES de tocar el ledger:
 *   el cobro nunca desaparece aunque lo de abajo falle.
 * Fase B (reconciliación idempotente): si es e-CF y aún no tiene pago en el
 *   ledger, registra el pago (pagos_recibidos + estado_pago). Reintentable: si
 *   ya existe un pago con la misma referencia, no duplica. Para cotización marca
 *   la cotización pagada (no auto-emite e-CF: una falla en DGII perdería el cobro).
 */
export async function marcarLinkPagado(
  token: string,
  resultado: ResultadoPago,
): Promise<MarcarPagadoResult> {
  // ── Fase A: persistir el resultado del pago (nunca se pierde) ───────────────
  const fase = await db.transaction(async (tx) => {
    const [link] = await tx.select().from(paymentLinks)
      .where(eq(paymentLinks.token, token))
      .for('update')
      .limit(1);

    if (!link) throw new Error(`marcarLinkPagado: token no existe (${token})`);

    if (link.estado === 'pagado' || link.pagoRecibidoId) {
      return { link, ya: true as const };
    }

    if (!resultado.aprobado) {
      await tx.update(paymentLinks)
        .set({ estado: 'fallido', updatedAt: new Date() })
        .where(eq(paymentLinks.id, link.id));
      return { link, declinado: true as const };
    }

    await tx.update(paymentLinks).set({
      estado:      'pagado',
      providerRef: resultado.providerRef ?? null,
      cardMask:    resultado.cardMask ?? null,
      paidAt:      new Date(),
      updatedAt:   new Date(),
    }).where(eq(paymentLinks.id, link.id));

    return { link, aprobado: true as const };
  });

  if ('ya' in fase)        return { estado: 'ya_pagado', pagoRecibidoId: fase.link.pagoRecibidoId };
  if ('declinado' in fase) return { estado: 'fallido' };

  // ── Fase B: reconciliar contra el ledger (idempotente, reintentable) ────────
  // Si falla, el cobro NO se pierde: el link ya quedó 'pagado' con su referencia
  // y reconciliarLedger es reintentable (cron/manual). Devolvemos 'pagado'.
  try {
    const pagoRecibidoId = await reconciliarLedger(token);
    return { estado: 'pagado', pagoRecibidoId };
  } catch {
    return { estado: 'pagado', pagoRecibidoId: null };
  }
}

/**
 * Lleva un link ya-pagado al ledger de cobros, de forma idempotente. Seguro de
 * reintentar (cron / callback repetido): el lock + la comprobación de pago
 * existente por referencia evitan doble registro. Un fallo aquí NO borra el
 * pago: el link sigue 'pagado' con su referencia y se puede reintentar.
 */
export async function reconciliarLedger(token: string): Promise<number | null> {
  return db.transaction(async (tx) => {
    const [link] = await tx.select().from(paymentLinks)
      .where(eq(paymentLinks.token, token))
      .for('update')
      .limit(1);

    if (!link || link.estado !== 'pagado') return null;
    if (link.pagoRecibidoId) return link.pagoRecibidoId; // ya reconciliado

    // Cotización: sin e-CF que abonar → marcar pagada y salir.
    if (link.cotizacionId && !link.ecfDocumentId) {
      await tx.update(cotizaciones)
        .set({ estado: 'pagada', updatedAt: new Date() })
        .where(and(eq(cotizaciones.id, link.cotizacionId), eq(cotizaciones.teamId, link.teamId)));
      return null;
    }

    if (!link.ecfDocumentId) return null;

    // Guarda anti-duplicado: ¿ya existe un pago con esta referencia?
    if (link.providerRef) {
      const [existente] = await tx.select({ id: pagosRecibidos.id }).from(pagosRecibidos)
        .where(and(
          eq(pagosRecibidos.ecfDocumentId, link.ecfDocumentId),
          eq(pagosRecibidos.referencia, link.providerRef),
        )).limit(1);
      if (existente) {
        await tx.update(paymentLinks).set({ pagoRecibidoId: existente.id, updatedAt: new Date() })
          .where(eq(paymentLinks.id, link.id));
        return existente.id;
      }
    }

    try {
      const hoy = new Date().toISOString().slice(0, 10);
      const { pago } = await registrarPago({
        teamId:        link.teamId,
        ecfDocumentId: link.ecfDocumentId,
        montoCentavos: link.montoCentavos,
        metodo:        'tarjeta',
        referencia:    link.providerRef ?? null,
        cuenta:        link.provider === 'azul' ? 'Azul'
                     : link.provider === 'cardnet' ? 'CardNet'
                     : 'Pago en línea',
        fechaPago:     hoy,
        notas:         `Pago en línea (${link.provider}) · orden ${link.ordenId}`,
        createdBy:     link.createdBy ?? undefined,
      });
      const pagoId = pago?.id ?? null;
      await tx.update(paymentLinks).set({ pagoRecibidoId: pagoId, updatedAt: new Date() })
        .where(eq(paymentLinks.id, link.id));
      await logInfo({ teamId: link.teamId, source: 'pagos/link',
        message: `Cobro en línea registrado`, details: { token, pagoId, ref: link.providerRef } });
      return pagoId;
    } catch (e) {
      // El pago NO se pierde: link sigue 'pagado' con ref; reintentable.
      await logError({ teamId: link.teamId, source: 'pagos/link',
        message: 'Fallo al reconciliar cobro en línea con el ledger (reintentable)',
        details: { token, ref: link.providerRef, error: String(e) } });
      throw e;
    }
  });
}

/** Marca links vencidos (para limpieza / mostrar en UI). */
export async function expirarLinksVencidos(teamId: number) {
  await db.update(paymentLinks)
    .set({ estado: 'expirado', updatedAt: new Date() })
    .where(and(
      eq(paymentLinks.teamId, teamId),
      eq(paymentLinks.estado, 'pendiente'),
      sql`${paymentLinks.expiresAt} < now()`,
    ));
}
