/**
 * POST /api/ecf/emitir
 *
 * Modos:
 *   modo = 'emitir'   (default) — firma + envía a DGII + guarda
 *   modo = 'borrador'           — guarda sin enviar a DGII
 *
 * Flujo (modo emitir):
 * 1. Valida autenticación y plan
 * 2. Obtiene secuencia (e-NCF) atómica
 * 3. Construye XML según tipo
 * 4. Firma XML con certificado P12 del tenant
 * 5. Envía a la DGII (TesteCF / CerteCF / eCF)
 * 6. Guarda el documento en la BD
 * 7. Retorna trackId + estado inicial
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db/drizzle';
import { ecfDocuments, teams, sequences } from '@/lib/db/schema';
import { getUser, getTeamIdForUser, getMonthlyEcfCount, getPlanLimit } from '@/lib/db/queries';
import { getPlan, PLANS } from '@/lib/config/plans';
import { eq, and } from 'drizzle-orm';
import { getNextEncf } from '@/lib/dgii/sequence';
import { buildEcfXml } from '@/lib/dgii/xml-builder';
import { DgiiSigner } from '@/lib/dgii/signer';
import { DgiiClient, type DgiiEnvironment } from '@/lib/dgii/client';
import { calcularTotales } from '@/lib/ecf/types';
import { logError, logInfo, parseDgiiError } from '@/lib/logger';

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
  rncComprador:         z.string().optional(),
  razonSocialComprador: z.string().optional(),
  emailComprador:       z.string().email().optional().or(z.literal('')).transform(v => v || undefined),
  tipoPago:             z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]).default(1),
  fechaLimitePago:      z.string().optional(),
  items:                z.array(itemSchema).min(1),
  ncfModificado:        z.string().optional(),

  // Campos extra
  notas:               z.string().optional(),
  terminosCondiciones: z.string().optional(),
  pieFactura:          z.string().optional(),
  retenciones:         z.array(retencionSchema).optional(),
  comentario:          z.string().optional(),

  // Pago recibido
  pagoRecibido: z.boolean().optional(),
  pagoMetodo:   z.string().optional(),
  pagoCuenta:   z.string().optional(),
  pagoValor:    z.number().min(0).optional(),
  pagoFecha:    z.string().optional(),

  // Para editar borradores
  clientId:      z.number().int().positive().optional(),
  lineasJson:    z.string().optional(), // JSON del form (ItemLinea[]) para restaurar edición
});

// ─── Handler ──────────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    // 1. Autenticación
    const user = await getUser();
    if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

    // 2. Obtener team activo del usuario
    const teamId = await getTeamIdForUser();
    if (!teamId) return NextResponse.json({ error: 'Sin empresa configurada' }, { status: 403 });

    // 3. Obtener perfil de la empresa
    const [team] = await db.select().from(teams).where(eq(teams.id, teamId)).limit(1);

    if (!team?.rnc) {
      return NextResponse.json({ error: 'RNC no configurado. Completa el perfil de tu empresa.' }, { status: 422 });
    }

    // 4. Verificar límite del plan (solo en modo emitir, no borrador)
    const body = await request.json();
    const modoPrevio = body?.modo ?? 'emitir';

    if (modoPrevio !== 'borrador') {
      const [monthlyCount, planLimit] = await Promise.all([
        getMonthlyEcfCount(teamId),
        Promise.resolve(getPlanLimit(team.planName)),
      ]);

      if (monthlyCount >= planLimit) {
        const currentPlan = getPlan(team.planName);
        const nextPlan = PLANS.find(p => p.limits.docs > currentPlan.limits.docs || p.limits.docs === -1);
        const sugerencia = nextPlan
          ? `Actualiza al plan ${nextPlan.name} ($${nextPlan.price}/mes) para ${nextPlan.limits.docs === -1 ? 'comprobantes ilimitados' : `hasta ${nextPlan.limits.docs} comprobantes/mes`}.`
          : 'Contacta a soporte para un plan Enterprise.';
        return NextResponse.json(
          {
            error: `Límite mensual alcanzado. Tu plan ${currentPlan.name} permite ${planLimit === -1 ? 'ilimitados' : planLimit} comprobantes/mes. Has emitido ${monthlyCount} este mes.`,
            detalles: {
              planActual: currentPlan.name,
              limite: planLimit,
              emitidoEsteMes: monthlyCount,
              sugerencia,
              urlUpgrade: '/pricing',
            },
          },
          { status: 403 }
        );
      }
    }

    // 5. Validar body
    const parsed = emitirSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Datos inválidos', detalles: parsed.error.flatten() }, { status: 400 });
    }

    const data = parsed.data;

    // ── Campos extra para guardar ──────────────────────────────────────────────
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

    // ── MODO BORRADOR: guardar sin enviar a DGII ───────────────────────────────
    if (data.modo === 'borrador') {
      const totales = calcularTotales(data.items);
      // Placeholder provisional para borradores — no es un e-NCF real.
      // Formato: BOR-{tipoEcf}-{timestamp base36 últimos 8 chars} → ≤ 20 chars
      const encfBorrador = `BOR-${data.tipoEcf}-${Date.now().toString(36).toUpperCase().slice(-8)}`;

      const [saved] = await db.insert(ecfDocuments).values({
        teamId,
        clientId:             data.clientId     ?? null,
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
        // Campos para poder restaurar el form al editar el borrador
        lineasJson:       data.lineasJson     ?? null,
        tipoPago:         data.tipoPago       ?? 1,
        fechaLimitePago:  data.fechaLimitePago ?? null,
        ...extraFields,
      }).returning();

      return NextResponse.json({ ok: true, modo: 'borrador', documentoId: saved.id, estado: 'BORRADOR' });
    }

    // ── MODO EMITIR ────────────────────────────────────────────────────────────

    if (!team.certP12 || !team.certPassword) {
      await logError({
        teamId: teamId,
        userId: user.id,
        source: '/api/ecf/emitir',
        message: 'Intento de emisión sin certificado digital configurado',
        details: { tipoEcf: data.tipoEcf, teamId },
      });
      return NextResponse.json(
        { error: 'Certificado digital no configurado. Sube tu P12 en Configuración → Certificado.' },
        { status: 422 }
      );
    }

    // 5. Obtener próxima secuencia (+ fecha vencimiento para XML)
    const seqRow = await db
      .select()
      .from(sequences)
      .where(and(eq(sequences.teamId, teamId), eq(sequences.tipoEcf, data.tipoEcf)))
      .limit(1)
      .then(rows => rows[0]);

    const { encf } = await getNextEncf(teamId, data.tipoEcf);

    // 6. Calcular totales
    const totales = calcularTotales(data.items);

    // 7. Construir XML
    const fechaEmision = new Date();
    const fechaVencimientoSecuencia = seqRow?.fechaVencimiento ?? new Date('2027-12-31');

    const xmlOriginal = buildEcfXml({
      tipoEcf:              data.tipoEcf,
      encf,
      rncEmisor:            team.rnc,
      razonSocialEmisor:    team.razonSocial ?? team.name,
      nombreComercialEmisor: team.nombreComercial ?? undefined,
      direccionEmisor:      team.direccion ?? undefined,
      fechaEmision,
      fechaVencimientoSecuencia,
      rncComprador:         data.rncComprador,
      razonSocialComprador: data.razonSocialComprador,
      emailComprador:       data.emailComprador,
      tipoPago:             data.tipoPago,
      fechaLimitePago:      data.fechaLimitePago ? new Date(data.fechaLimitePago) : undefined,
      items: data.items.map((item, i) => ({
        ...item,
        numeroLinea: i + 1,
        montoItem: item.precioUnitarioItem * item.cantidadItem - (item.descuentoMonto ?? 0),
        montoItbis: item.tasaItbis
          ? (item.precioUnitarioItem * item.cantidadItem - (item.descuentoMonto ?? 0)) * item.tasaItbis
          : undefined,
      })),
      ...totales,
      ncfModificado: data.ncfModificado,
    });

    // 8. Firmar XML
    const p12Buffer = Buffer.from(team.certP12, 'base64');
    const signer = new DgiiSigner({
      p12Buffer,
      password: team.certPassword,
      environment: (team.dgiiEnvironment as DgiiEnvironment) ?? 'TesteCF',
    });

    // 8b. Autenticar + firmar + enviar — todo en un bloque para capturar errores DGII
    let token: string;
    let expiresAt: Date;
    try {
      ({ token, expiresAt } = await signer.authenticate());
    } catch (authErr: unknown) {
      const msg = authErr instanceof Error ? authErr.message : String(authErr);
      await logError({
        teamId, userId: user.id,
        source: '/api/ecf/emitir [AUTH]',
        message: `Error autenticando con DGII ${team.dgiiEnvironment}: ${msg}`,
        details: { rncEmisor: team.rnc, ambiente: team.dgiiEnvironment, error: msg },
      });
      return NextResponse.json(
        {
          error: `Error de autenticación con la DGII: ${msg}`,
          detalles: {
            sugerencia: 'Verifica que el certificado P12 esté registrado en el ambiente ' +
              `${team.dgiiEnvironment ?? 'TesteCF'} de la DGII y que el RNC coincida con el del certificado.`,
          },
        },
        { status: 422 },
      );
    }

    const xmlFirmado = signer.signXml(xmlOriginal, 'ECF');
    const codigoSeguridad = signer.extractSecurityCode(xmlFirmado);

    // 9. Enviar a DGII
    const client = new DgiiClient((team.dgiiEnvironment as DgiiEnvironment) ?? 'TesteCF');
    client.setToken(token, expiresAt);

    const esRfce = data.tipoEcf === '32' && totales.montoTotal < 250000;
    let trackId: string;
    let estadoInicial: string;

    try {
      if (esRfce) {
        const rfceXml = signer.toRfce(xmlFirmado);
        const rfceRes = await client.enviarRfce(rfceXml, team.rnc, encf);
        trackId = rfceRes.trackId;
        estadoInicial = 'EN_PROCESO';
      } else {
        const ecfRes = await client.enviarEcf(xmlFirmado, team.rnc, encf);
        trackId = ecfRes.trackId;
        estadoInicial = 'EN_PROCESO';
      }
    } catch (dgiiErr: unknown) {
      const dgiiMsg = dgiiErr instanceof Error ? dgiiErr.message : String(dgiiErr);
      const { status: dgiiStatus, body: dgiiBody, resumen } = parseDgiiError(dgiiMsg);
      await logError({
        teamId, userId: user.id,
        source: '/api/ecf/emitir [ENVIO]',
        message: `DGII rechazó el e-CF ${encf}: ${resumen}`,
        details: {
          encf, tipoEcf: data.tipoEcf, rncEmisor: team.rnc,
          codigoHttp: dgiiStatus, respuestaDGII: dgiiBody, xmlOriginal,
        },
      });
      return NextResponse.json(
        {
          error: `La DGII rechazó el comprobante: ${resumen}`,
          detalles: {
            codigoHttp: dgiiStatus, respuestaDGII: dgiiBody, encf,
            sugerencia: 'Consulta /dashboard/activity para ver el XML enviado y el error completo.',
          },
        },
        { status: 422 },
      );
    }

    // 10. Guardar en BD
    const [saved] = await db.insert(ecfDocuments).values({
      teamId,
      encf,
      tipoEcf:              data.tipoEcf,
      estado:               estadoInicial,
      trackId,
      codigoSeguridad,
      xmlOriginal,
      xmlFirmado,
      rncComprador:         data.rncComprador,
      razonSocialComprador: data.razonSocialComprador,
      emailComprador:       data.emailComprador,
      montoTotal:           Math.round(totales.montoTotal * 100),
      totalItbis:           Math.round(totales.totalItbis * 100),
      ncfModificado:        data.ncfModificado,
      fechaEmision,
      ...extraFields,
    }).returning();

    // Log de emisión exitosa
    await logInfo({
      teamId,
      userId: user.id,
      source: '/api/ecf/emitir',
      message: `e-CF emitido correctamente: ${encf}`,
      details: { encf, tipoEcf: data.tipoEcf, trackId, montoTotal: totales.montoTotal },
    });

    // Dispatch outbound webhooks (fire-and-forget)
    import('@/lib/webhooks').then(({ dispatchWebhook }) =>
      dispatchWebhook(teamId, 'ecf.emitido', {
        encf,
        tipoEcf: data.tipoEcf,
        trackId,
        estado: estadoInicial,
        montoTotal: totales.montoTotal,
        documentoId: saved.id,
      })
    ).catch(() => {});

    return NextResponse.json({
      ok:              true,
      modo:            'emitir',
      encf,
      trackId,
      estado:          estadoInicial,
      codigoSeguridad,
      montoTotal:      totales.montoTotal,
      documentoId:     saved.id,
    });
  } catch (err: unknown) {
    console.error('[/api/ecf/emitir]', err);

    const rawMessage = err instanceof Error ? err.message : 'Error interno desconocido';

    // Extraer y parsear el error de la DGII si viene de su API
    const isDgiiError = rawMessage.includes('Error enviando e-CF') || rawMessage.includes('Error enviando RFCE');
    const { status: dgiiStatus, body: dgiiBody, resumen: dgiiResumen } = isDgiiError
      ? parseDgiiError(rawMessage)
      : { status: null, body: null, resumen: rawMessage };

    // Construir mensaje de usuario claro
    let userMessage = rawMessage;
    let userDetails: Record<string, unknown> | null = null;

    if (isDgiiError) {
      userMessage = `La DGII rechazó el comprobante: ${dgiiResumen}`;
      userDetails = {
        codigoHttp: dgiiStatus,
        respuestaDGII: dgiiBody,
        sugerencia: dgiiStatus === 400
          ? 'Verifica que los ítems tengan ITBIS correctamente asignado y que el RNC del emisor esté activo en DGII.'
          : 'Consulta la respuesta de la DGII para más detalles.',
      };
    }

    // Guardar en system_logs (best-effort, fire-and-forget)
    logError({
      source: '/api/ecf/emitir',
      message: userMessage,
      details: {
        errorOriginal: rawMessage,
        ...(userDetails ?? {}),
      },
    }).catch(() => {});

    return NextResponse.json(
      {
        error: userMessage,
        ...(userDetails ? { detalles: userDetails } : {}),
      },
      { status: 500 }
    );
  }
}
