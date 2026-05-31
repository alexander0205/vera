/**
 * POST /api/facturas/[id]/emitir-ecf
 *
 * Emite a la DGII un documento que fue creado sin eCF (tipoEcf='sin-ncf')
 * o que está en estado BORRADOR.
 *
 * Body: { tipoEcf: '31' | '32' | ... }
 *
 * El servidor reconstruye el payload completo desde los datos guardados en BD
 * y llama a ecf-api para firmar + enviar a DGII. El documento existente es
 * ACTUALIZADO con el e-NCF, trackId, codigoSeguridad y nuevo estado.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db/drizzle';
import { ecfDocuments, teams, teamMembers, users } from '@/lib/db/schema';
import { getUser, getTeamIdForUser } from '@/lib/db/queries';
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

// ─── Schema ───────────────────────────────────────────────────────────────────

const bodySchema = z.object({
  tipoEcf: z.enum(['31', '32', '33', '34', '41', '43', '44', '45', '46', '47']),
  // Permite completar el comprador al emitir (cuando la factura se creó sin RNC).
  rncComprador:         z.string().trim().min(1).max(20).optional(),
  razonSocialComprador: z.string().trim().min(1).max(255).optional(),
});

// Reglas por tipoEcf — espejo de lib/ecf/types.ts (no importable porque ese módulo
// trae además helpers cliente que no necesitamos acá).
const REGLAS: Record<string, { rnc: boolean; razon: boolean; ncfMod: boolean; permiteItbis: boolean }> = {
  '31': { rnc: true,  razon: true,  ncfMod: false, permiteItbis: true  },
  '32': { rnc: false, razon: false, ncfMod: false, permiteItbis: true  },
  '33': { rnc: true,  razon: true,  ncfMod: true,  permiteItbis: true  },
  '34': { rnc: true,  razon: true,  ncfMod: true,  permiteItbis: true  },
  '41': { rnc: true,  razon: true,  ncfMod: false, permiteItbis: true  },
  '43': { rnc: false, razon: false, ncfMod: false, permiteItbis: false },
  '44': { rnc: true,  razon: true,  ncfMod: false, permiteItbis: false },
  '45': { rnc: true,  razon: true,  ncfMod: false, permiteItbis: true  },
  '46': { rnc: false, razon: true,  ncfMod: false, permiteItbis: false },
  '47': { rnc: false, razon: true,  ncfMod: false, permiteItbis: false },
};

const RNC_RE = /^\d{9}$|^\d{11}$/;

// ─── Adquirir próximo eNCF (same as in /api/ecf/emitir) ─────────────────────

async function acquireNextEncf(
  teamId: number,
  tipoEcf: string,
): Promise<{ encf: string; sequenceId: number } | null> {
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
  return { encf, sequenceId: row.id };
}

// ─── Handler ──────────────────────────────────────────────────────────────────

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getUser();
    if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

    const teamId = await getTeamIdForUser();
    if (!teamId) return NextResponse.json({ error: 'Sin empresa configurada' }, { status: 403 });

    // ── Gate: facturas:emitir-dgii ────────────────────────────────────────────
    const [[u], [m]] = await Promise.all([
      db.select({ platformRole: users.platformRole }).from(users).where(eq(users.id, user.id)).limit(1),
      db.select({ role: teamMembers.role }).from(teamMembers).where(and(eq(teamMembers.userId, user.id), eq(teamMembers.teamId, teamId))).limit(1),
    ]);
    if (!userCan(u?.platformRole, m?.role, 'facturas:emitir-dgii')) {
      return NextResponse.json({ error: 'Sin permiso para emitir a la DGII' }, { status: 403 });
    }

    const { id } = await params;
    const docId = parseInt(id);
    if (isNaN(docId)) return NextResponse.json({ error: 'ID inválido' }, { status: 400 });

    // Validate body
    const body = await request.json();
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Datos inválidos', detalles: parsed.error.flatten() }, { status: 400 });
    }
    const { tipoEcf, rncComprador: rncOverride, razonSocialComprador: razonOverride } = parsed.data;

    // Load document + team
    const [row] = await db
      .select({ doc: ecfDocuments, team: teams })
      .from(ecfDocuments)
      .innerJoin(teams, eq(teams.id, ecfDocuments.teamId))
      .where(and(eq(ecfDocuments.id, docId), eq(ecfDocuments.teamId, teamId)))
      .limit(1);

    if (!row) return NextResponse.json({ error: 'Documento no encontrado' }, { status: 404 });

    const { doc, team } = row;

    // Permitir emisión para documentos SIN e-CF real: BORRADOR, HISTORICA
    // (importadas de Alegra) o sin-ncf. Bloquear los que ya fueron a DGII o
    // están anulados.
    const yaEnDgii = ['EN_PROCESO', 'ACEPTADO', 'ACEPTADO_CONDICIONAL', 'RECHAZADO'].includes(doc.estado);
    if (doc.estado === 'ANULADO' || yaEnDgii) {
      return NextResponse.json(
        { error: `El documento ya fue procesado (estado: ${doc.estado}). Solo se pueden enviar a DGII facturas sin e-CF (borrador, histórica o sin-ncf).` },
        { status: 422 },
      );
    }

    if (!team?.rnc) {
      return NextResponse.json(
        { error: 'RNC no configurado. Completa el perfil de tu empresa.' },
        { status: 422 },
      );
    }

    // ─── Pre-flight: validar campos obligatorios para el tipoEcf seleccionado ──
    const regla = REGLAS[tipoEcf];
    const rncFinal   = (rncOverride   ?? doc.rncComprador         ?? '').trim();
    const razonFinal = (razonOverride ?? doc.razonSocialComprador ?? '').trim();

    const errores: { campo: string; mensaje: string; resoluble: boolean }[] = [];

    if (regla.rnc && !rncFinal) {
      errores.push({
        campo: 'rncComprador',
        mensaje: `e${tipoEcf} requiere RNC o Cédula del comprador.`,
        resoluble: true,
      });
    }
    if (rncFinal && !RNC_RE.test(rncFinal.replace(/[-\s]/g, ''))) {
      errores.push({
        campo: 'rncComprador',
        mensaje: 'El RNC/Cédula debe tener 9 u 11 dígitos.',
        resoluble: true,
      });
    }
    if (regla.razon && !razonFinal) {
      errores.push({
        campo: 'razonSocialComprador',
        mensaje: `e${tipoEcf} requiere razón social del comprador.`,
        resoluble: true,
      });
    }
    if (regla.ncfMod && !doc.ncfModificado) {
      errores.push({
        campo: 'ncfModificado',
        mensaje: `e${tipoEcf} debe referenciar un e-NCF previo (factura original).`,
        resoluble: false,
      });
    }

    if (errores.length > 0) {
      return NextResponse.json(
        {
          error: 'Faltan datos requeridos por la DGII',
          mensaje: errores.map(e => e.mensaje).join(' '),
          errores,
          action: errores.every(e => e.resoluble) ? 'complete-in-modal' : 'edit-factura',
        },
        { status: 422 },
      );
    }

    // Persistir overrides en ecf_documents (sobrevive al emit)
    if (
      (rncOverride   && rncOverride   !== (doc.rncComprador ?? '')) ||
      (razonOverride && razonOverride !== (doc.razonSocialComprador ?? ''))
    ) {
      await db
        .update(ecfDocuments)
        .set({
          rncComprador:         rncFinal || null,
          razonSocialComprador: razonFinal || null,
          updatedAt:            new Date(),
        })
        .where(eq(ecfDocuments.id, docId));
      doc.rncComprador         = rncFinal || null;
      doc.razonSocialComprador = razonFinal || null;
    }

    // Cross-doc: si es NC/débito (33/34) con padre referenciado, el padre debe
    // tener eCF real. Bloquear "Enviar a DGII" si padre sigue sin-eCF.
    if ((tipoEcf === '33' || tipoEcf === '34') && doc.ncfModificado) {
      const [parent] = await db
        .select({ tipoEcf: ecfDocuments.tipoEcf, encf: ecfDocuments.encf })
        .from(ecfDocuments)
        .where(and(eq(ecfDocuments.teamId, teamId), eq(ecfDocuments.encf, doc.ncfModificado)))
        .limit(1);

      if (parent) {
        const parentSinEcf = parent.tipoEcf === 'sin-ncf'
          || (parent.encf?.startsWith('BOR-') ?? false);
        if (parentSinEcf) {
          return NextResponse.json(
            {
              error: 'La factura referenciada no tiene e-CF',
              mensaje: `La NC/débito referencia ${doc.ncfModificado}, que aún no tiene e-CF. Envía primero la factura padre a la DGII, o deja esta NC como sin-eCF.`,
              parentEncf: doc.ncfModificado,
            },
            { status: 409 },
          );
        }
      }
    }

    // Parse items from lineasJson
    let items: Array<{
      nombreItem: string;
      descripcionItem?: string;
      cantidadItem: number;
      precioUnitarioItem: number;
      descuentoMonto?: number;
      tasaItbis?: 0.18 | 0.16 | 0;
      indicadorBienoServicio?: 1 | 2;
    }> = [];

    if (doc.lineasJson) {
      try {
        const parsed = JSON.parse(doc.lineasJson) as Array<Record<string, unknown>>;
        items = parsed
          .filter(i => i.nombreItem && (Number(i.cantidadItem) || 0) > 0 && (Number(i.precioUnitarioItem) || 0) > 0)
          .map(i => {
            const tasa = String(i.tasaItbis ?? 'exento');
            const tasaFloat: 0.18 | 0.16 | 0 | undefined =
              tasa === '0.18' ? 0.18 :
              tasa === '0.16' ? 0.16 :
              tasa === '0'    ? 0    :
              undefined; // exento

            const base = (Number(i.cantidadItem) || 1) * (Number(i.precioUnitarioItem) || 0);
            const descPct = Number(i.descuentoPct) || 0;
            const descuentoMonto = descPct > 0 ? base * (descPct / 100) : undefined;

            return {
              nombreItem:             String(i.nombreItem),
              descripcionItem:        i.descripcionItem ? String(i.descripcionItem) : undefined,
              cantidadItem:           Number(i.cantidadItem) || 1,
              precioUnitarioItem:     Number(i.precioUnitarioItem) || 0,
              descuentoMonto,
              tasaItbis:              tasaFloat,
              indicadorBienoServicio: (i.indicadorBienoServicio === 1 || i.indicadorBienoServicio === '1') ? 1 : 2,
            };
          });
      } catch {
        return NextResponse.json({ error: 'No se pudieron procesar los ítems del documento.' }, { status: 422 });
      }
    }

    if (items.length === 0) {
      return NextResponse.json(
        {
          error:   'La factura no tiene ítems válidos',
          mensaje: 'Para emitir a la DGII la factura debe tener al menos un ítem con nombre, cantidad y precio. Edita la factura para agregarlos.',
          errores: [{ campo: 'lineas', mensaje: 'No hay ítems válidos.', resoluble: false }],
          action:  'edit-factura',
        },
        { status: 422 },
      );
    }

    const totales = calcularTotales(items);

    // DGII: e32 (Factura de Consumo) >= DOP 250,000 exige RNC + razón social.
    if (tipoEcf === '32' && totales.montoTotal >= 250_000 && (!rncFinal || !razonFinal)) {
      return NextResponse.json(
        {
          error:   'e32 sobre DOP 250,000 requiere comprador',
          mensaje: 'Por norma DGII, una Factura de Consumo (e32) por DOP 250,000 o más debe incluir RNC/Cédula y razón social del comprador.',
          errores: [
            ...(!rncFinal   ? [{ campo: 'rncComprador',         mensaje: 'RNC/Cédula requerido por superar DOP 250,000.', resoluble: true }] : []),
            ...(!razonFinal ? [{ campo: 'razonSocialComprador', mensaje: 'Razón social requerida por superar DOP 250,000.', resoluble: true }] : []),
          ],
          action:  'complete-in-modal',
        },
        { status: 422 },
      );
    }

    // ITBIS no permitido en este tipo pero hay items con ITBIS → debe editar la factura.
    if (!regla.permiteItbis && items.some(i => (i.tasaItbis ?? 0) > 0)) {
      return NextResponse.json(
        {
          error:   `e${tipoEcf} no permite ITBIS`,
          mensaje: `El tipo e${tipoEcf} no admite ítems con ITBIS. Edita la factura y marca los ítems como exentos o cambia el tipo.`,
          errores: [{ campo: 'lineas', mensaje: 'Hay ítems con ITBIS pero el tipo no lo permite.', resoluble: false }],
          action:  'edit-factura',
        },
        { status: 422 },
      );
    }

    // Ensure contribuyente en ecf-api
    let codigoPublico: string;
    try {
      codigoPublico = await ensureContribuyente(teamId);
    } catch (err) {
      console.error('[emitir-ecf ensureContribuyente]', err);
      return NextResponse.json(
        { error: 'No se pudo verificar el contribuyente en ecf-api. Verifica que el perfil esté completo.' },
        { status: 422 },
      );
    }

    // Acquire next eNCF
    const acquired = await acquireNextEncf(teamId, tipoEcf);
    if (!acquired) {
      return NextResponse.json(
        {
          error: `No hay secuencias disponibles para tipo ${tipoEcf}. ` +
                 `Verifica que tengas un rango activo y no vencido en /dashboard/secuencias.`,
        },
        { status: 422 },
      );
    }
    const { encf: encfAsignado, sequenceId: sequenceConsumedId } = acquired;
    console.log(`[emitir-ecf] eNCF asignado: ${encfAsignado} para doc #${docId}`);

    // Build mapper payload
    const tipoPago = (doc.tipoPago ?? 1) as 1 | 2 | 3 | 4;
    const { tipo, dto: ecfApiDto } = mapToEcfApiDto({
      tipoEcf,
      items,
      totales,
      rncComprador:         doc.rncComprador ?? undefined,
      razonSocialComprador: doc.razonSocialComprador ?? undefined,
      emailComprador:       doc.emailComprador ?? undefined,
      tipoPago,
      fechaLimitePago:      doc.fechaLimitePago ?? undefined,
      ncfModificado:        doc.ncfModificado ?? undefined,
      encfOverride:         encfAsignado,
    });

    // Ambiente DGII: no se envía. ecf-api usa el del contribuyente (contrib.ambiente).

    // Call ecf-api
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
      console.error('[emitir-ecf ecf-api]', err);
      if (err instanceof EcfApiError) {
        const resolved = resolveEcfApiError(err);
        return NextResponse.json(
          {
            error:        resolved.mensaje,
            code:         resolved.code,
            action:       resolved.action,
            statusEcfApi: err.status,
            ...(resolved.dgiiDetalle ? { dgii: resolved.dgiiDetalle } : {}),
            ...(process.env.NODE_ENV !== 'production' ? { mensajeOriginal: err.humanMessage } : {}),
          },
          { status: resolved.proxyStatus },
        );
      }
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

    // Map estado
    const mapeoEstado: Record<string, string> = {
      ACEPTADO:             'ACEPTADO',
      ACEPTADO_CONDICIONAL: 'ACEPTADO_CONDICIONAL',
      ENVIADO:              'EN_PROCESO',
      PENDIENTE:            'EN_PROCESO',
      RECHAZADO:            'RECHAZADO',
      ERROR:                'RECHAZADO',
    };
    const estadoUpper   = String(resultado.estado ?? '').toUpperCase();
    const estadoFinal   = mapeoEstado[estadoUpper] ?? (resultado.trackId ? 'EN_PROCESO' : 'ACEPTADO');
    const encfFinal     = resultado.eNcf ?? encfAsignado;
    const trackId       = resultado.trackId ?? '';

    if (encfAsignado && encfFinal && encfFinal !== encfAsignado) {
      console.warn(`[emitir-ecf] eNCF DIVERGENTE: local=${encfAsignado} ecf-api=${encfFinal} (seq.id=${sequenceConsumedId})`);
    }

    // Update the existing document in-place (within audit context so trigger captures user)
    await withRequestAuditContext(
      (tx) => tx
        .update(ecfDocuments)
        .set({
          encf:            encfFinal,
          tipoEcf,
          estado:          estadoFinal,
          trackId,
          codigoSeguridad: resultado.codigoSeguridad ?? null,
          fechaFirma:      resultado.fechaHoraFirma ?? null,
          urlVerificacion: resultado.urlVerificacion ?? resultado.qrCodeData ?? null,
          ecfApiEmisionId: resultado.id,
          fechaEmision:    new Date(resultado.fechaEmision),
          updatedAt:       new Date(),
        })
        .where(eq(ecfDocuments.id, docId)),
      { userId: user.id, teamId },
    );

    await logInfo({
      teamId,
      userId: user.id,
      source: `/api/facturas/${docId}/emitir-ecf`,
      message: `e-CF emitido desde borrador: ${encfFinal}`,
      details: { encf: encfFinal, tipoEcf, trackId, montoTotal: totales.montoTotal, ecfApiId: resultado.id, docId },
    });

    logAudit({
      teamId, userId: user.id, actor: user.email,
      action:   'ECF_SEND',
      resource: encfFinal,
      ip:       getIp(request),
      meta:     { tipoEcf, trackId, montoTotal: totales.montoTotal, via: 'emitir-ecf', docId },
    });

    return NextResponse.json({
      ok:              true,
      encf:            encfFinal,
      trackId,
      estado:          estadoFinal,
      codigoSeguridad: resultado.codigoSeguridad,
      montoTotal:      totales.montoTotal,
      documentoId:     docId,
    });

  } catch (err: unknown) {
    console.error('[emitir-ecf]', err);
    await logError({
      source:  `/api/facturas/emitir-ecf`,
      message: err instanceof Error ? err.message : 'Error interno',
    }).catch(() => {});
    return NextResponse.json({ error: 'Error interno al emitir' }, { status: 500 });
  }
}
