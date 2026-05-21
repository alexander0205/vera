/**
 * POST /api/habilitacion/firmar-xml
 *
 * Firma un XML del usuario delegando a ecf-api (el P12 vive allá).
 * Se usa para:
 *   - Formulario de Postulación (descargado del portal DGII)
 *   - Declaración Jurada (descargada del portal DGII)
 *
 * Body (JSON):
 *   xmlBase64:    string  — XML sin firmar en base64
 *   proposito:    'postulacion' | 'declaracion-jurada' | 'otro'
 *
 * Respuesta (mismo contrato que antes):
 *   xmlFirmadoBase64: string  — XML firmado en base64
 *   xmlFirmadoNombre: string  — sugerencia de nombre de archivo
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getUser, getTeamIdForUser } from '@/lib/db/queries';
import { logAudit, getIp } from '@/lib/audit';
import { rateLimitDb } from '@/lib/rate-limit';
import { contribuyentes, EcfApiError, type TipoDocumentoFirma } from '@/lib/ecf-api/client';
import { ensureContribuyente, ContribuyenteCamposFaltantesError } from '@/lib/ecf-api/contribuyente';

// ─── Schema ───────────────────────────────────────────────────────────────────

const bodySchema = z.object({
  xmlBase64:     z.string().min(10),
  proposito:     z.enum(['postulacion', 'declaracion-jurada', 'otro']).default('otro'),
  /**
   * Si se pasa, fuerza firma con cert de ese contribuyente.
   * Requiere `user.platformRole === 'admin'`. Sin esto se usa el team del user.
   */
  codigoPublico: z.string().min(1).optional(),
});

// ─── Mapeo proposito → tipoDocumento (según swagger ecf-api) ─────────────────

function mapTipoDocumento(proposito: string): TipoDocumentoFirma | undefined {
  if (proposito === 'postulacion')        return 'Postulacion';
  if (proposito === 'declaracion-jurada') return 'DeclaracionJurada';
  // 'otro' → omitir para que ecf-api auto-detecte el tipo del XML
  return undefined;
}

// ─── Handler ──────────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const user = await getUser();
    if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

    const teamId = await getTeamIdForUser();
    if (!teamId) return NextResponse.json({ error: 'Sin empresa' }, { status: 403 });

    const body   = await request.json().catch(() => ({}));
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Datos inválidos', detalles: parsed.error.flatten() }, { status: 400 });
    }

    const { xmlBase64, proposito, codigoPublico: cpOverride } = parsed.data;

    // Validación básica: que el base64 decodifique a algo que parezca XML
    try {
      const texto = Buffer.from(xmlBase64, 'base64').toString('utf8');
      if (!texto.trim().startsWith('<')) {
        return NextResponse.json({ error: 'El contenido decodificado no es un XML válido' }, { status: 400 });
      }
    } catch {
      return NextResponse.json({ error: 'xmlBase64 inválido' }, { status: 400 });
    }

    // Resolver codigoPublico:
    //   - Si admin pasa `codigoPublico` → firma con ese contribuyente (admin-on-behalf)
    //   - Si no → usa el contribuyente del team del user
    let codigoPublico: string;
    let firmandoComoAdmin = false;
    if (cpOverride) {
      if (user.platformRole !== 'admin') {
        return NextResponse.json(
          { error: 'Solo administradores pueden firmar para otro contribuyente.' },
          { status: 403 },
        );
      }
      codigoPublico     = cpOverride;
      firmandoComoAdmin = true;
    } else {
      try {
        codigoPublico = await ensureContribuyente(teamId);
      } catch (err) {
        if (err instanceof ContribuyenteCamposFaltantesError) {
          return NextResponse.json(
            { error: 'Completa el perfil de tu empresa antes de firmar.', camposFaltantes: err.faltantes },
            { status: 422 },
          );
        }
        console.error('[/api/habilitacion/firmar-xml] ensureContribuyente', err);
        return NextResponse.json({ error: 'Error interno' }, { status: 500 });
      }
    }

    // Rate limit: 30 firmas/hora scoped por codigoPublico (target empresa)
    const rl = await rateLimitDb(`habilitacion_sign:${codigoPublico}`, 30, 60 * 60_000);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: 'Demasiados intentos de firma. Espera un momento antes de reintentar.' },
        { status: 429 },
      );
    }

    // Delegar firma a ecf-api
    let resultado;
    try {
      resultado = await contribuyentes.firmaXml(codigoPublico, {
        xmlBase64,
        tipoDocumento: mapTipoDocumento(proposito),
      });
    } catch (err) {
      if (err instanceof EcfApiError) {
        console.error('[/api/habilitacion/firmar-xml] EcfApiError', err.status, err.message);
        if (err.status === 422 || err.status === 404) {
          // Sin P12 activo o contribuyente no encontrado
          return NextResponse.json(
            {
              error: 'No hay certificado P12 activo. Sube tu certificado en Certificado Digital.',
              sugerencia: '/dashboard/certificado',
            },
            { status: 422 },
          );
        }
        if (err.status === 400) {
          return NextResponse.json({ error: 'El XML enviado no es válido.' }, { status: 400 });
        }
        if (err.status === 401 || err.status === 403) {
          console.error('[/api/habilitacion/firmar-xml] Unauthorized — verificar ECF_API_KEY');
          return NextResponse.json({ error: 'Error de configuración interna' }, { status: 500 });
        }
        // Cualquier otro status de ecf-api (e.g. 500)
        return NextResponse.json({ error: 'Error al firmar el XML' }, { status: 500 });
      }
      // TypeError: fetch failed (ECONNREFUSED) — ecf-api no está corriendo
      const isNetworkError = err instanceof TypeError && (err as TypeError).message.includes('fetch');
      if (isNetworkError) {
        console.error('[/api/habilitacion/firmar-xml] ecf-api no disponible (ECONNREFUSED)');
        return NextResponse.json({ error: 'Servicio de firma no disponible. Intenta más tarde.' }, { status: 503 });
      }
      console.error('[/api/habilitacion/firmar-xml] ecf-api unexpected error:', err);
      return NextResponse.json({ error: 'Error al firmar el XML' }, { status: 500 });
    }

    logAudit({
      teamId, userId: user.id, actor: user.email,
      action: 'HABILITACION_SIGN',
      ip:     getIp(request),
      meta:   {
        proposito,
        tipoDocumento:    mapTipoDocumento(proposito),
        codigoPublico,
        firmandoComoAdmin,
      },
    });

    return NextResponse.json({
      ok:               true,
      xmlFirmadoBase64: resultado.xmlFirmadoBase64,
      xmlFirmadoNombre: resultado.nombreArchivo,
    });
  } catch (err) {
    console.error('[/api/habilitacion/firmar-xml]', err);
    return NextResponse.json({ error: 'Error interno al firmar' }, { status: 500 });
  }
}
