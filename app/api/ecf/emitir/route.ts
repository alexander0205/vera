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
import { ecfDocuments, teams, teamMembers, users, dependientes } from '@/lib/db/schema';
import { getUser, getTeamIdForUser, getMonthlyEcfCount, getPlanLimit, registrarPago } from '@/lib/db/queries';
import { getPlan, PLANS } from '@/lib/config/plans';
import { eq, and, sql } from 'drizzle-orm';
import { userCan } from '@/lib/config/roles';
import { calcularTotales } from '@/lib/ecf/types';
import { logError, logInfo } from '@/lib/logger';
import { logAudit, getIp } from '@/lib/audit';
import { emision, EcfApiError } from '@/lib/ecf-api/client';
import { resolveEcfApiError } from '@/lib/ecf-api/error-codes';
import { ensureContribuyente } from '@/lib/ecf-api/contribuyente';
import { mapToEcfApiDto } from '@/lib/ecf-api/emision-mapper';
import { withRequestAuditContext } from '@/lib/db/audit-context';

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
  // 'sin-ncf' only allowed in borrador mode (validated below)
  tipoEcf:              z.enum(['31', '32', '33', '34', '41', '43', '44', '45', '46', '47', 'sin-ncf']),
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

  // Dependiente del cliente — metadato, no va al XML DGII
  dependienteId:     z.number().int().positive().optional(),
  dependienteNombre: z.string().max(255).optional(),
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

    // ── Gate: facturas:crear ──────────────────────────────────────────────────
    const [[u], [m]] = await Promise.all([
      db.select({ platformRole: users.platformRole }).from(users).where(eq(users.id, user.id)).limit(1),
      db.select({ role: teamMembers.role }).from(teamMembers).where(and(eq(teamMembers.userId, user.id), eq(teamMembers.teamId, teamId))).limit(1),
    ]);
    if (!userCan(u?.platformRole, m?.role, 'facturas:crear')) {
      return NextResponse.json({ error: 'Sin permiso para crear facturas' }, { status: 403 });
    }

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

    // Cross-field: sin-ncf solo permitido en modo borrador
    if (data.tipoEcf === 'sin-ncf' && data.modo !== 'borrador') {
      return NextResponse.json(
        { error: 'tipoEcf sin-ncf solo puede usarse en modo borrador. Selecciona un tipo de e-CF para emitir a la DGII.' },
        { status: 400 },
      );
    }

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

    // Cross-doc: si se referencia un padre (ncfModificado), validar que ese padre
    // tenga eCF real (no sin-ncf, no borrador). NC con eCF sobre factura sin-eCF
    // es incoherente — la factura padre debe promoverse primero a eCF via
    // "Enviar a DGII" antes de poder emitir la NC con eCF.
    if (data.ncfModificado && data.modo !== 'borrador' && data.tipoEcf !== 'sin-ncf') {
      const [parent] = await db
        .select({ tipoEcf: ecfDocuments.tipoEcf, estado: ecfDocuments.estado, encf: ecfDocuments.encf })
        .from(ecfDocuments)
        .where(and(eq(ecfDocuments.teamId, teamId), eq(ecfDocuments.encf, data.ncfModificado)))
        .limit(1);

      if (parent) {
        const parentSinEcf = parent.tipoEcf === 'sin-ncf'
          || (parent.encf?.startsWith('BOR-') ?? false);
        if (parentSinEcf) {
          return NextResponse.json(
            {
              error: 'La factura referenciada no tiene e-CF',
              mensaje: 'No puedes emitir una NC con e-CF sobre una factura sin e-CF. Primero envía la factura padre a la DGII ("Enviar a DGII" en el detalle), o crea esta NC también sin e-CF (tipoEcf="sin-ncf").',
              parentEncf: data.ncfModificado,
              parentTipoEcf: parent.tipoEcf,
            },
            { status: 409 },
          );
        }
      }
    }

    // Cross-field: tipoPago=2 (crédito) requiere fechaLimitePago.
    if (data.tipoPago === 2 && !data.fechaLimitePago && data.modo !== 'borrador') {
      return NextResponse.json(
        { error: 'fechaLimitePago es obligatoria para tipo de pago Crédito (tipoPago=2).' },
        { status: 400 },
      );
    }

    // ── Validación dependiente ────────────────────────────────────────────────
    if (data.clientId) {
      // Count how many dependientes this client has (scoped to team for security)
      const [depCount] = await db
        .select({ cnt: sql`COUNT(*)::int` })
        .from(dependientes)
        .where(and(eq(dependientes.clientId, data.clientId), eq(dependientes.teamId, teamId)));
      const hasDependientes = Number((depCount as { cnt: number })?.cnt ?? 0) > 0;

      if (hasDependientes && !data.dependienteId) {
        return NextResponse.json(
          { error: 'Este cliente requiere seleccionar un dependiente.' },
          { status: 422 },
        );
      }

      // Security: verify the submitted dependienteId belongs to this clientId and team
      if (data.dependienteId) {
        const [dep] = await db
          .select({ id: dependientes.id })
          .from(dependientes)
          .where(and(
            eq(dependientes.id,       data.dependienteId),
            eq(dependientes.clientId, data.clientId),
            eq(dependientes.teamId,   teamId),
          ))
          .limit(1);
        if (!dep) {
          return NextResponse.json(
            { error: 'El dependiente seleccionado no pertenece a este cliente.' },
            { status: 422 },
          );
        }
      }
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
      // sin-ncf: encf vacío (no hay comprobante, no generar BOR-sin-ncf-XXX).
      // Otros borradores (borrador real de tipo e31/e32/etc): prefijo BOR- para
      // distinguir de e-CF reales (E31...) y evitar colisiones.
      const encfBorrador = data.tipoEcf === 'sin-ncf'
        ? ''
        : `BOR-${data.tipoEcf}-${Date.now().toString(36).toUpperCase().slice(-8)}`;

      const [saved] = await withRequestAuditContext(
        (tx) => tx.insert(ecfDocuments).values({
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
          createdBy:            user.id,
          dependienteId:        data.dependienteId ?? null,
          dependienteNombre:    data.dependienteNombre ?? null,
          ...extraFields,
        }).returning(),
        { userId: user.id, teamId },
      );

      // Pago al crear: registrar en el ledger (source of truth). Inline ya quedó
      // como seed en extraFields; registrarPago lo sincroniza desde el ledger.
      if (data.pagoRecibido && data.pagoValor && data.pagoValor > 0) {
        try {
          await registrarPago({
            teamId,
            ecfDocumentId: saved.id,
            montoCentavos: Math.min(Math.round(data.pagoValor * 100), Math.round(totales.montoTotal * 100)),
            metodo:        data.pagoMetodo || 'otro',
            cuenta:        data.pagoCuenta || null,
            fechaPago:     data.pagoFecha || new Date().toISOString().slice(0, 10),
            createdBy:     user.id,
          });
        } catch (e) { console.error('[emitir borrador registrarPago]', e); }
      }

      return NextResponse.json({
        ok:           true,
        modo:         'borrador',
        documentoId:  saved.id,
        encf:         saved.encf,
        estado:       'BORRADOR',
        montoTotal:   totales.montoTotal,
        pagoRecibido: data.pagoRecibido ?? false,
        pagoMetodo:   data.pagoRecibido ? (data.pagoMetodo ?? 'efectivo') : null,
        pagoValor:    data.pagoRecibido ? Math.min(data.pagoValor ?? totales.montoTotal, totales.montoTotal) : null,
      });
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

    // Ambiente DGII: NO se envía. ecf-api ya conoce el ambiente del
    // contribuyente (contrib.ambiente) y emite en el ambiente correcto.

    // ── Log server-side del body exacto que se envía a ecf-api ──────────────────
    console.log(
      `[ecf/emitir] → ecf-api | tipo=${tipo} esRfce=${esRfce} contribuyente=${codigoPublico}`,
      '\nDTO:', JSON.stringify(ecfApiDto, null, 2),
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
      resultado = await emision.emitirUnified(codigoPublico, wrappedBody);
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

    const [saved] = await withRequestAuditContext(
      (tx) => tx.insert(ecfDocuments).values({
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
        createdBy:            user.id,
        dependienteId:        data.dependienteId ?? null,
        dependienteNombre:    data.dependienteNombre ?? null,
        ...extraFields,
      }).returning(),
      { userId: user.id, teamId },
    );

    // Pago al emitir: registrar en el ledger (source of truth pagos_recibidos).
    if (data.pagoRecibido && data.pagoValor && data.pagoValor > 0) {
      try {
        await registrarPago({
          teamId,
          ecfDocumentId: saved.id,
          montoCentavos: Math.min(Math.round(data.pagoValor * 100), Math.round(totales.montoTotal * 100)),
          metodo:        data.pagoMetodo || 'otro',
          cuenta:        data.pagoCuenta || null,
          fechaPago:     data.pagoFecha || new Date().toISOString().slice(0, 10),
          createdBy:     user.id,
        });
      } catch (e) { console.error('[emitir registrarPago]', e); }
    }

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
