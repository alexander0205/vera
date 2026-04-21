/**
 * POST /api/habilitacion/firmar-xml
 *
 * Firma un XML arbitrario del usuario con el certificado P12 del team.
 * Se usa para:
 *   - Formulario de Postulación (descargado del portal DGII)
 *   - Declaración Jurada (descargada del portal DGII, paso 13)
 *
 * Body (JSON):
 *   xmlBase64:   string      — XML sin firmar en base64
 *   rootElement?: string      — nombre del elemento raíz (auto-detecta si no se provee)
 *
 * Respuesta:
 *   xmlFirmadoBase64: string  — XML firmado en base64
 *   xmlFirmadoNombre: string  — sugerencia de nombre de archivo
 *   rootElement:      string  — root element detectado/usado
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db/drizzle';
import { teams } from '@/lib/db/schema';
import { getUser, getTeamIdForUser } from '@/lib/db/queries';
import { eq } from 'drizzle-orm';
import { DgiiSigner } from '@/lib/dgii/signer';
import { type DgiiEnvironment } from '@/lib/dgii/client';
import { decryptField, isEncrypted } from '@/lib/crypto/cert';
import { logError, logInfo } from '@/lib/logger';
import { logAudit, getIp } from '@/lib/audit';
import { rateLimitDb } from '@/lib/rate-limit';

// ─── Schema ───────────────────────────────────────────────────────────────────

const bodySchema = z.object({
  xmlBase64:    z.string().min(10),
  rootElement:  z.string().optional(),
  proposito:    z.enum(['postulacion', 'declaracion-jurada', 'otro']).default('otro'),
});

// ─── Helper: detecta el root element de un XML ────────────────────────────────

function detectarRootElement(xml: string): string | null {
  // Busca el primer elemento después de la declaración XML / comentarios / doctype
  const limpio = xml
    .replace(/<\?xml[^?]*\?>/g, '')         // declaración
    .replace(/<!--[\s\S]*?-->/g, '')        // comentarios
    .replace(/<!DOCTYPE[^>]*>/gi, '')       // doctype
    .trim();
  const match = limpio.match(/^<([A-Za-z_][A-Za-z0-9_\-:]*)/);
  return match ? match[1].replace(/^.*:/, '') : null;  // quita namespace prefix si hay
}

// ─── Handler ──────────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const user = await getUser();
    if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

    const teamId = await getTeamIdForUser();
    if (!teamId) return NextResponse.json({ error: 'Sin empresa' }, { status: 403 });

    // Rate limit: 30 firmas por hora (habilitación + declaración jurada no deberían ser miles)
    const rl = await rateLimitDb(`habilitacion_sign:${teamId}`, 30, 60 * 60_000);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: 'Demasiados intentos de firma. Espera un momento antes de reintentar.' },
        { status: 429 },
      );
    }

    const body   = await request.json().catch(() => ({}));
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Datos inválidos', detalles: parsed.error.flatten() }, { status: 400 });
    }

    const { xmlBase64, rootElement: rootHint, proposito } = parsed.data;

    // Decodificar XML
    let xmlPlano: string;
    try {
      xmlPlano = Buffer.from(xmlBase64, 'base64').toString('utf8');
    } catch {
      return NextResponse.json({ error: 'XML en base64 inválido' }, { status: 400 });
    }

    if (!xmlPlano.trim().startsWith('<')) {
      return NextResponse.json({ error: 'El contenido no parece un XML válido' }, { status: 400 });
    }

    // Detectar root element si no se proveyó
    const rootElement = rootHint ?? detectarRootElement(xmlPlano) ?? 'ECF';

    // Cargar cert del team
    const [team] = await db.select().from(teams).where(eq(teams.id, teamId)).limit(1);
    if (!team) return NextResponse.json({ error: 'Empresa no encontrada' }, { status: 404 });

    if (!isEncrypted(team.certP12Ciphered, team.certP12Iv, team.certP12AuthTag)) {
      return NextResponse.json(
        {
          error: 'Certificado digital no configurado. Sube tu P12 en Configuración → Certificado.',
          sugerencia: '/dashboard/certificado',
        },
        { status: 422 },
      );
    }

    // Descifrar
    let p12Base64: string;
    let pin: string;
    try {
      p12Base64 = decryptField({
        ciphered: team.certP12Ciphered!,
        iv:       team.certP12Iv!,
        authTag:  team.certP12AuthTag!,
      });
      pin = decryptField({
        ciphered: team.certPinCiphered!,
        iv:       team.certPinIv!,
        authTag:  team.certPinAuthTag!,
      });
    } catch (decErr) {
      await logError({
        teamId, userId: user.id,
        source: '/api/habilitacion/firmar-xml [DECRYPT]',
        message: `Error descifrando certificado: ${decErr instanceof Error ? decErr.message : String(decErr)}`,
      });
      return NextResponse.json(
        { error: 'No se pudo descifrar el certificado. Contacta a soporte.' },
        { status: 500 },
      );
    }

    logAudit({
      teamId,
      userId: user.id,
      actor:  user.email,
      action: 'CERT_ACCESS_FOR_SIGN',
      resource: team.certSerial ?? undefined,
      ip:     getIp(request),
      meta:   { proposito, rootElement },
    });

    // Firmar
    let xmlFirmado: string;
    try {
      const signer = new DgiiSigner({
        p12Buffer:   Buffer.from(p12Base64, 'base64'),
        password:    pin,
        environment: (team.dgiiEnvironment as DgiiEnvironment) ?? 'TesteCF',
      });
      xmlFirmado = signer.signXml(xmlPlano, rootElement as 'ECF');
    } catch (signErr) {
      const msg = signErr instanceof Error ? signErr.message : String(signErr);
      await logError({
        teamId, userId: user.id,
        source: '/api/habilitacion/firmar-xml [SIGN]',
        message: `Error firmando XML: ${msg}`,
        details: { proposito, rootElement, rnc: team.rnc },
      });
      return NextResponse.json(
        { error: `No se pudo firmar el XML: ${msg}` },
        { status: 500 },
      );
    }

    logAudit({
      teamId, userId: user.id, actor: user.email,
      action: 'HABILITACION_SIGN',
      ip: getIp(request),
      meta: { proposito, rootElement, tamaño: xmlFirmado.length },
    });

    await logInfo({
      teamId, userId: user.id,
      source: '/api/habilitacion/firmar-xml',
      message: `XML firmado (${proposito}, root: ${rootElement})`,
      details: { proposito, rootElement },
    });

    const xmlFirmadoBase64 = Buffer.from(xmlFirmado, 'utf8').toString('base64');

    const nombreBase = proposito === 'postulacion'
      ? `postulacion-firmada-${team.rnc ?? teamId}.xml`
      : proposito === 'declaracion-jurada'
        ? `declaracion-jurada-firmada-${team.rnc ?? teamId}.xml`
        : `xml-firmado-${Date.now()}.xml`;

    return NextResponse.json({
      ok: true,
      xmlFirmadoBase64,
      xmlFirmadoNombre: nombreBase,
      rootElement,
    });
  } catch (err) {
    console.error('[/api/habilitacion/firmar-xml]', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Error interno' },
      { status: 500 },
    );
  }
}
