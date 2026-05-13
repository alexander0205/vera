/**
 * POST /api/ecf/emitir
 *
 * Modos:
 *   modo = 'emitir'   — delega a ecf-api (firma + envío DGII + NCF asignado allá)
 *   modo = 'borrador' — guarda localmente sin enviar
 *
 * ecf-api gestiona el P12, la firma y la comunicación con DGII.
 * emitedo guarda el resultado para auditoría, PDFs y webhooks salientes.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db/drizzle';
import { ecfDocuments, teams } from '@/lib/db/schema';
import { getUser, getTeamIdForUser, getMonthlyEcfCount, getPlanLimit } from '@/lib/db/queries';
import { getPlan, PLANS } from '@/lib/config/plans';
import { eq, sql } from 'drizzle-orm';
import { calcularTotales } from '@/lib/ecf/types';
import { logError, logInfo } from '@/lib/logger';
import { logAudit, getIp } from '@/lib/audit';
import { emision, EcfApiError } from '@/lib/ecf-api/client';
import { resolveEcfApiError } from '@/lib/ecf-api/error-codes';
import { ensureContribuyente } from '@/lib/ecf-api/contribuyente';
import { mapToEcfApiDto } from '@/lib/ecf-api/emision-mapper';

// ─── Schema de validación ─────────────────────────────────────────────────────

const itemSchema = z.object({
  nombreItem:             z.string().min(1),
  descripcionItem:        z.string().optional(),
  cantidadItem:           z.number().positive(),
  unidadMedidaItem:       z.string().optional(),
  precioUnitarioItem:     z.number().positive(),
  descuentoMonto:         z.number().min(0).optional(),
  tasaItbis:              z.union([z.literal(0.18), z.literal(0.16), z.literal(0)]).optional(),
  indicadorBienoServicio: z.union([z.literal(1), z.literal(2)]).optional(),
});

const retencionSchema = z.object({
  id:         z.string(),
  nombre:     z.string(),
  porcentaje: z.number(),
  tipo:       z.enum(['itbis', 'isr', 'otro']),
  monto:      z.number(),
});

const emitirSchema = z.object({
  modo:                 z.enum(['emitir', 'borrador']).default('emitir'),
  tipoEcf:              z.enum(['31', '32', '33', '34', '41', '43', '44', '45', '46', '47']),
  rncComprador:         z.string().regex(/^\d{9,11}$/, 'RNC debe tener 9-11 dígitos').optional(),
  razonSocialComprador: z.string().optional(),
  emailComprador:       z.string().email().optional().or(z.literal('')).transform(v => v || undefined),
  tipoPago:             z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]).default(1),
  fechaLimitePago:      z.string().optional(),
  items:                z.array(itemSchema).min(1),
  ncfModificado:        z.string().optional(),
  codigoModificacion:   z.coerce.number().int().min(1).max(5).optional(),
  fechaNcfModificado:   z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  razonModificacion:    z.string().optional(),
  // Acepta number (1..6) o string ("01".."06" o "1".."6"). Mapper normaliza a XSD "0X".
  tipoIngresos: z.union([
    z.coerce.number().int().min(1).max(6),
    z.string().regex(/^(0?[1-6])$/),
  ]).optional(),

  notas:               z.string().optional(),
  terminosCondiciones: z.string().optional(),
  pieFactura:          z.string().optional(),
  retenciones:         z.array(retencionSchema).optional(),
  comentario:          z.string().optional(),

  pagoRecibido: z.boolean().optional(),
  pagoMetodo:   z.string().optional(),
  pagoCuenta:   z.string().optional(),
  pagoValor:    z.number().min(0).optional(),
  pagoFecha:    z.string().optional(),

  clientId:   z.number().int().positive().optional(),
  lineasJson: z.string().optional(),

  // Override de e-NCF para habilitación (no consume la secuencia del rango)
  encfOverride: z.string().regex(/^E\d{12}$/).optional(),

  // Tipo 47 — tasa de retención ISR pagos al exterior.
  // Default 0.27 (general). 0.10 países con tratado, 0.15 servicios técnicos, etc.
  tasaIsrRetencion: z.number().min(0).max(1).optional(),
});

// ─── Adquirir próximo eNCF de secuencia local ────────────────────────────────
// Pre-emit: emitedo es la fuente de verdad del NCF.
// Toma la mejor secuencia activa (preferida, luego más disponibles), incrementa
// `secuencia_actual` atómicamente con `FOR UPDATE SKIP LOCKED` y retorna el
// número consumido formateado como eNCF (`E{tipo}{10 dígitos}`).
//
// Diseño:
// - SKIP LOCKED → emisiones concurrentes no bloquean entre sí (cada una toma
//   la siguiente fila libre).
// - El número asignado es `secuencia_actual - 1` después del UPDATE.
// - Si el rango está agotado o vencido, retorna null (caller decide error).
async function acquireNextEncf(
  teamId: number,
  tipoEcf: string,
): Promise<{ encf: string; sequenceId: number; numero: string } | null> {
  const rows = await db.execute<{ id: number; numero: string }>(sql`
    UPDATE sequences
    SET secuencia_actual = secuencia_actual + 1,
        updated_at       = NOW()
    WHERE id = (
      SELECT id FROM sequences
      WHERE team_id = ${teamId}
        AND tipo_ecf = ${tipoEcf}
        AND secuencia_actual <= secuencia_hasta
        AND (fecha_vencimiento IS NULL OR fecha_vencimiento > NOW())
      ORDER BY preferida DESC, (secuencia_hasta - secuencia_actual) DESC, id ASC
      LIMIT 1
      FOR UPDATE SKIP LOCKED
    )
    RETURNING id, (secuencia_actual - 1)::text AS numero
  `);

  const row = rows[0] as { id: number; numero: string } | undefined;
  if (!row) return null;

  const encf = `E${tipoEcf}${row.numero.padStart(10, '0')}`;
  return { encf, sequenceId: row.id, numero: row.numero };
}

// ─── Handler ──────────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const user = await getUser();
    if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

    const teamId = await getTeamIdForUser();
    if (!teamId) return NextResponse.json({ error: 'Sin empresa configurada' }, { status: 403 });

    const [team] = await db.select().from(teams).where(eq(teams.id, teamId)).limit(1);

    const body = await request.json();
    const modoPrevio = body?.modo ?? 'emitir';
    // Solo para pruebas internas — no está en el schema público
    const skipRangeValidation: boolean = body?.skipRangeValidation === true;

    if (modoPrevio !== 'borrador' && !team?.rnc) {
      return NextResponse.json(
        { error: 'RNC no configurado. Completa el perfil de tu empresa.' },
        { status: 422 },
      );
    }

    // Verificar límite del plan
    if (modoPrevio !== 'borrador') {
      const [monthlyCount, planLimit] = await Promise.all([
        getMonthlyEcfCount(teamId),
        Promise.resolve(getPlanLimit(team.planName, team.subscriptionStatus)),
      ]);

      if (planLimit !== -1 && monthlyCount >= planLimit) {
        const currentPlan = getPlan(team.planName);
        const nextPlan = PLANS.find(p => p.limits.docs > currentPlan.limits.docs || p.limits.docs === -1);
        const sugerencia = nextPlan
          ? `Actualiza al plan ${nextPlan.name} ($${nextPlan.price}/mes).`
          : 'Contacta a soporte para un plan Enterprise.';
        return NextResponse.json(
          {
            error: `Límite mensual alcanzado. Tu plan ${currentPlan.name} permite ${planLimit} comprobantes/mes. Has emitido ${monthlyCount} este mes.`,
            detalles: { planActual: currentPlan.name, limite: planLimit, emitidoEsteMes: monthlyCount, sugerencia, urlUpgrade: '/pricing' },
          },
          { status: 403 },
        );
      }
    }

    const parsed = emitirSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Datos inválidos', detalles: parsed.error.flatten() }, { status: 400 });
    }

    const data = parsed.data;

    // Cross-field: cuando se referencia un NCF que se modifica (tipos 33, 34),
    // codigoModificacion y fechaNcfModificado son obligatorios.
    if (data.ncfModificado && data.modo !== 'borrador') {
      if (data.codigoModificacion === undefined) {
        return NextResponse.json(
          { error: 'codigoModificacion es obligatorio cuando se referencia un NCF modificado (tipos 33, 34).' },
          { status: 400 },
        );
      }
      if (!data.fechaNcfModificado) {
        return NextResponse.json(
          { error: 'fechaNcfModificado es obligatoria cuando se referencia un NCF modificado (tipos 33, 34).' },
          { status: 400 },
        );
      }
    }

    // Cross-field: tipoPago=2 (crédito) requiere fechaLimitePago.
    if (data.tipoPago === 2 && !data.fechaLimitePago && data.modo !== 'borrador') {
      return NextResponse.json(
        { error: 'fechaLimitePago es obligatoria para tipo de pago Crédito (tipoPago=2).' },
        { status: 400 },
      );
    }

    const extraFields = {
      notas:               data.notas          || null,
      terminosCondiciones: data.terminosCondiciones || null,
      pieFactura:          data.pieFactura      || null,
      retenciones:         data.retenciones?.length ? JSON.stringify(data.retenciones) : null,
      comentario:          data.comentario      || null,
      pagoRecibido:        data.pagoRecibido    ? 'true' : 'false',
      pagoMetodo:          data.pagoMetodo      || null,
      pagoCuenta:          data.pagoCuenta      || null,
      pagoValorCts:        data.pagoValor       ? Math.round(data.pagoValor * 100) : 0,
      pagoFecha:           data.pagoFecha       || null,
      totalRetenciones:    data.retenciones
        ? Math.round(data.retenciones.reduce((s, r) => s + r.monto, 0) * 100)
        : 0,
    };

    // ── MODO BORRADOR ──────────────────────────────────────────────────────────
    if (data.modo === 'borrador') {
      const totales = calcularTotales(data.items);
      const encfBorrador = `BOR-${data.tipoEcf}-${Date.now().toString(36).toUpperCase().slice(-8)}`;

      const [saved] = await db.insert(ecfDocuments).values({
        teamId,
        clientId:             data.clientId ?? null,
        encf:                 encfBorrador,
        tipoEcf:              data.tipoEcf,
        estado:               'BORRADOR',
        rncComprador:         data.rncComprador,
        razonSocialComprador: data.razonSocialComprador,
        emailComprador:       data.emailComprador,
        montoTotal:           Math.round(totales.montoTotal * 100),
        totalItbis:           Math.round(totales.totalItbis * 100),
        ncfModificado:        data.ncfModificado,
        fechaEmision:         new Date(),
        lineasJson:           data.lineasJson ?? null,
        tipoPago:             data.tipoPago ?? 1,
        fechaLimitePago:      data.fechaLimitePago ?? null,
        ...extraFields,
      }).returning();

      return NextResponse.json({ ok: true, modo: 'borrador', documentoId: saved.id, estado: 'BORRADOR' });
    }

    // ── MODO EMITIR via ecf-api ────────────────────────────────────────────────

    const totales = calcularTotales(data.items);

    // Obtener/registrar contribuyente en ecf-api
    let codigoPublico: string;
    try {
      codigoPublico = await ensureContribuyente(teamId);
    } catch (err) {
      console.error('[/api/ecf/emitir ensureContribuyente]', err);
      return NextResponse.json(
        { error: 'No se pudo verificar el contribuyente en ecf-api. Verifica que el perfil esté completo.' },
        { status: 422 },
      );
    }

    // Adquirir próximo eNCF de la secuencia local SALVO que venga override
    // explícito (habilitación o tests). Emitedo es fuente de verdad del NCF;
    // ecf-api recibe el eNCF ya asignado y solo firma + envía a DGII.
    let encfAsignado: string | undefined = data.encfOverride;
    let sequenceConsumedId: number | null = null;
    if (!encfAsignado) {
      const acquired = await acquireNextEncf(teamId, data.tipoEcf);
      if (!acquired) {
        return NextResponse.json(
          {
            error: `No hay secuencias disponibles para tipo ${data.tipoEcf}. ` +
                   `Verifica que tengas un rango activo y no vencido en /dashboard/secuencias.`,
          },
          { status: 422 },
        );
      }
      encfAsignado       = acquired.encf;
      sequenceConsumedId = acquired.sequenceId;
      console.log(`[ecf/emitir] eNCF asignado localmente: ${encfAsignado} (seq.id=${sequenceConsumedId})`);
    }

    // Mapear payload al DTO de ecf-api
    const { tipo, esRfce, dto: ecfApiDto } = mapToEcfApiDto({
      tipoEcf:              data.tipoEcf,
      items:                data.items,
      totales,
      rncComprador:         data.rncComprador,
      razonSocialComprador: data.razonSocialComprador,
      emailComprador:       data.emailComprador,
      tipoPago:             data.tipoPago,
      fechaLimitePago:      data.fechaLimitePago,
      ncfModificado:        data.ncfModificado,
      codigoModificacion:   data.codigoModificacion,
      fechaNcfModificado:   data.fechaNcfModificado,
      tipoIngresos:         data.tipoIngresos,
      retenciones:          data.retenciones, // tipos 31/32/33/34
      encfOverride:         encfAsignado,
      tasaIsrRetencion:     data.tasaIsrRetencion, // tipo 47
      skipRangeValidation,
    });

    // Ambiente DGII: siempre enviado explícito en header.
    // - Habilitación (skipRangeValidation): usa ECF_HABILITACION_AMBIENTE override (dev=TesteCF, prod=CerteCF)
    // - Emisión normal: usa team.dgiiEnvironment ('TesteCF' | 'CerteCF' | 'Produccion')
    const habilitacionAmbiente = process.env.ECF_HABILITACION_AMBIENTE
      ?? (process.env.NODE_ENV === 'production' ? 'CerteCF' : 'TesteCF');
    const ambiente = skipRangeValidation
      ? habilitacionAmbiente
      : (team.dgiiEnvironment ?? 'TesteCF');
    const habilitacionHeaders: Record<string, string> = {
      'X-Dgii-Ambiente': ambiente,
    };

    // ── Log server-side del body exacto que se envía a ecf-api ──────────────────
    console.log(
      `[ecf/emitir] → ecf-api | tipo=${tipo} esRfce=${esRfce} contribuyente=${codigoPublico}`,
      '\nDTO:', JSON.stringify(ecfApiDto, null, 2),
      habilitacionHeaders ? `\nHeaders: ${JSON.stringify(habilitacionHeaders)}` : '',
    );

    // Llamar a ecf-api — usar endpoint unificado (/emisiones/emitir)
    // ecf-api espera body wrapped: { tipoComprobante, formato?, payload: {...campos del comprobante} }
    // El mapper devuelve un DTO plano — extraemos tipoComprobante + formato y movemos el resto a `payload`.
    let resultado;
    try {
      const { tipoComprobante: tipoCmp, formato: fmt, ...payloadFields } = ecfApiDto as Record<string, unknown> & {
        tipoComprobante?: string;
        formato?: string;
      };
      const wrappedBody = {
        tipoComprobante: tipoCmp ?? tipo,
        ...(fmt ? { formato: fmt } : {}),
        payload: payloadFields,
      };
      resultado = await emision.emitirUnified(codigoPublico, wrappedBody, habilitacionHeaders);
    } catch (err) {
      console.error('[/api/ecf/emitir ecf-api]', err);

      if (err instanceof EcfApiError) {
        const resolved = resolveEcfApiError(err);
        return NextResponse.json(
          {
            error:       resolved.mensaje,
            code:        resolved.code,
            action:      resolved.action,
            statusEcfApi: err.status,
            // DGII upstream útil para el usuario (códigos 75, 156, 181, etc.)
            ...(resolved.dgiiDetalle ? { dgii: resolved.dgiiDetalle } : {}),
            // En desarrollo incluir body crudo para debugging; en prod ocultar.
            ...(process.env.NODE_ENV !== 'production' ? { mensajeOriginal: err.humanMessage } : {}),
          },
          { status: resolved.proxyStatus },
        );
      }

      // Otros errores (timeout, network, parseo, etc.) — no son EcfApiError.
      const raw = err instanceof Error ? err.message : 'Error desconocido';
      const esTimeout = /timeout|econnreset|etimedout|aborted/i.test(raw);
      return NextResponse.json(
        {
          error: esTimeout
            ? 'Tiempo de espera agotado al comunicarse con el servicio de firma. Reintenta.'
            : 'No se pudo enviar el comprobante. Intenta de nuevo.',
          action: 'retry-later',
          ...(process.env.NODE_ENV !== 'production' ? { mensajeOriginal: raw } : {}),
        },
        { status: 502 },
      );
    }

    // Map ecf-api estado → emitedo estado (alineado con MAPA_ESTADOS de /api/ecf/estado)
    const mapeoEstado: Record<string, string> = {
      ACEPTADO:             'ACEPTADO',
      ACEPTADO_CONDICIONAL: 'ACEPTADO_CONDICIONAL',
      ENVIADO:              'EN_PROCESO',
      PENDIENTE:            'EN_PROCESO',
      RECHAZADO:            'RECHAZADO',
      ERROR:                'RECHAZADO',
    };
    const estadoUpper = String(resultado.estado ?? '').toUpperCase();
    const estadoInicial = mapeoEstado[estadoUpper] ?? (resultado.trackId ? 'EN_PROCESO' : 'ACEPTADO');
    const encf          = resultado.eNcf;
    const trackId       = resultado.trackId ?? '';

    // Validar que ecf-api respetó el eNCF que asignamos localmente.
    // Si difiere, la secuencia local quedará desincronizada y el XML firmado
    // contendrá un NCF distinto al que consumimos. Loguear para investigación.
    if (encfAsignado && encf && encf !== encfAsignado) {
      console.warn(
        `[ecf/emitir] eNCF DIVERGENTE: local=${encfAsignado} ecf-api=${encf}. ` +
        `Secuencia local pudo quedar desfasada (seq.id=${sequenceConsumedId}).`,
      );
    }

    // Guardar en BD local (auditoría + PDFs + webhooks)
    const lineasJsonParaGuardar = data.lineasJson
      ?? JSON.stringify(data.items.map(item => ({
          nombreItem:         item.nombreItem,
          descripcionItem:    item.descripcionItem,
          cantidadItem:       item.cantidadItem,
          precioUnitarioItem: item.precioUnitarioItem,
          descuentoMonto:     item.descuentoMonto ?? 0,
          tasaItbis:          item.tasaItbis ?? 0,
          subtotalConItbis:   item.precioUnitarioItem * item.cantidadItem * (1 + (item.tasaItbis ?? 0)),
          unidadMedida:       item.unidadMedidaItem,
        })));

    const [saved] = await db.insert(ecfDocuments).values({
      teamId,
      encf,
      tipoEcf:              data.tipoEcf,
      estado:               estadoInicial,
      trackId,
      codigoSeguridad:      resultado.codigoSeguridad ?? null,
      fechaFirma:           resultado.fechaHoraFirma ?? null,
      urlVerificacion:      resultado.urlVerificacion ?? resultado.qrCodeData ?? null,
      ecfApiEmisionId:      resultado.id,
      rncComprador:         data.rncComprador,
      razonSocialComprador: data.razonSocialComprador,
      emailComprador:       data.emailComprador,
      montoTotal:           Math.round(totales.montoTotal * 100),
      totalItbis:           Math.round(totales.totalItbis * 100),
      ncfModificado:        data.ncfModificado,
      fechaEmision:         new Date(resultado.fechaEmision),
      lineasJson:           lineasJsonParaGuardar,
      tipoPago:             data.tipoPago ?? 1,
      fechaLimitePago:      data.fechaLimitePago ?? null,
      ...extraFields,
    }).returning();

    await logInfo({
      teamId,
      userId: user.id,
      source: '/api/ecf/emitir',
      message: `e-CF emitido via ecf-api: ${encf}`,
      details: { encf, tipoEcf: data.tipoEcf, trackId, montoTotal: totales.montoTotal, ecfApiId: resultado.id },
    });

    logAudit({
      teamId, userId: user.id, actor: user.email,
      action:   'ECF_SEND',
      resource: encf,
      ip:       getIp(request),
      meta:     { tipoEcf: data.tipoEcf, trackId, montoTotal: totales.montoTotal, via: 'ecf-api' },
    });

    import('@/lib/webhooks').then(({ dispatchWebhook }) =>
      dispatchWebhook(teamId, 'ecf.emitido', {
        encf, tipoEcf: data.tipoEcf, trackId, estado: estadoInicial,
        montoTotal: totales.montoTotal, documentoId: saved.id,
      })
    ).catch(() => {});

    return NextResponse.json({
      ok:              true,
      modo:            'emitir',
      encf,
      trackId,
      estado:          estadoInicial,
      codigoSeguridad: resultado.codigoSeguridad,
      montoTotal:      totales.montoTotal,
      documentoId:     saved.id,
    });

  } catch (err: unknown) {
    console.error('[/api/ecf/emitir]', err);
    await logError({
      source:  '/api/ecf/emitir',
      message: err instanceof Error ? err.message : 'Error interno',
    }).catch(() => {});
    return NextResponse.json({ error: 'Error interno al emitir' }, { status: 500 });
  }
}
